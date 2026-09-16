"""Run with the system Python that provides python3-uno; no model calls."""
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

import uno
from com.sun.star.beans import PropertyValue


def properties(**values):
    result = []
    for name, value in values.items():
        prop = PropertyValue()
        prop.Name, prop.Value = name, value
        result.append(prop)
    return tuple(result)


def export(source, destination):
    destination = Path(destination).resolve()
    pipe = 'notale_' + uuid.uuid4().hex
    process = subprocess.Popen([
        'libreoffice', '-env:UserInstallation=' + (destination/'profile').as_uri(),
        '--headless', '--nologo', '--nodefault', '--norestore',
        '--accept=pipe,name=' + pipe + ';urp;StarOffice.ComponentContext',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    document = None
    desktop = None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        deadline = time.monotonic() + 15
        while True:
            try:
                context = resolver.resolve('uno:pipe,name=' + pipe + ';urp;StarOffice.ComponentContext')
                break
            except Exception:
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('Could not start the private LibreOffice worker')
                time.sleep(.1)
        desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
        document = desktop.loadComponentFromURL(Path(source).resolve().as_uri(), '_blank', 0, properties(
            Hidden=True, ReadOnly=True, MacroExecutionMode=0, UpdateDocMode=0))
        if document is None or not document.supportsService('com.sun.star.presentation.PresentationDocument'):
            raise ValueError('Input is not a presentation')
        pages = document.getDrawPages()
        # The presentation SVG filter retains object order and master associations.
        # GraphicExportFilter flattens drawing actions and can reorder gradients.
        document.storeToURL((destination/'presentation.svg').as_uri(), properties(FilterName='impress_svg_Export'))
        metadata = []
        for index in range(pages.getCount()):
            page = pages.getByIndex(index)
            filename = f'slide-{index+1:02}.svg'
            # UNO page dimensions are 1/100 mm. SVG's default viewport rounds to mm;
            # retain the actual page size instead, including the original aspect ratio.
            slots = []
            for shape in page:
                if getattr(shape, 'IsEmptyPresentationObject', False):
                    slots.append({'name': shape.Name, 'type': shape.ShapeType,
                                  'x': shape.Position.X, 'y': shape.Position.Y,
                                  'width': shape.Size.Width, 'height': shape.Size.Height})
            metadata.append({'file': filename, 'width': page.Width, 'height': page.Height,
                             'name': page.Name, 'placeholders': slots})
        (destination/'pages.json').write_text(json.dumps(metadata, ensure_ascii=False))
    finally:
        try:
            if document is not None:
                document.close(True)
            if desktop is not None:
                desktop.terminate()
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    export(*sys.argv[1:])
