"""Input identity/inventory only. Template interpretation belongs to the subject."""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from capture.common import sha256


def inspect_pptx(path):
    path = Path(path).resolve()
    if path.suffix.lower() != ".pptx" or not path.is_file():
        raise ValueError("--pptx must name an existing .pptx file")
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            if not {"[Content_Types].xml", "ppt/presentation.xml"} <= names:
                raise ValueError("input is not a PPTX presentation package")
            if z.getinfo("ppt/presentation.xml").file_size > 4 * 1024 * 1024:
                raise ValueError("presentation.xml exceeds inventory limit")
            root = ET.fromstring(z.read("ppt/presentation.xml"))
            ns = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main"}
            size = root.find("p:sldSz", ns)
            slides = root.find("p:sldIdLst", ns)
            counts = {key: sum(bool(re.fullmatch(pattern, n)) for n in names) for key, pattern in {
                "slide_parts": r"ppt/slides/slide\d+\.xml",
                "layout_parts": r"ppt/slideLayouts/slideLayout\d+\.xml",
                "master_parts": r"ppt/slideMasters/slideMaster\d+\.xml",
                "theme_parts": r"ppt/theme/theme\d+\.xml",
                "media_parts": r"ppt/media/[^/]+",
            }.items()}
    except (zipfile.BadZipFile, ET.ParseError, KeyError) as e:
        raise ValueError("invalid PPTX: " + str(e)) from e
    return {"source_path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size,
            "slide_count": len(slides) if slides is not None else 0,
            "slide_size_emu": dict(size.attrib) if size is not None else None, **counts}
