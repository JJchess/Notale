import io
import sys

from PIL import Image


def main():
    source, x, y, w, h = sys.argv[1:6]
    with Image.open(source) as image:
        image = image.convert("RGBA")
        width, height = image.size
        x, y, w, h = map(float, (x, y, w, h))
        # A small context rim preserves local lighting and edge continuity while
        # keeping unrelated slide text out of image-to-image asset requests.
        pad_x = w * 0.04
        pad_y = h * 0.04
        left = max(0, round((x - pad_x) * width))
        top = max(0, round((y - pad_y) * height))
        right = min(width, round((x + w + pad_x) * width))
        bottom = min(height, round((y + h + pad_y) * height))
        if right <= left or bottom <= top:
            raise ValueError("empty crop")
        crop = image.crop((left, top, right, bottom))
        output = io.BytesIO()
        crop.save(output, format="PNG", optimize=True)
        sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
