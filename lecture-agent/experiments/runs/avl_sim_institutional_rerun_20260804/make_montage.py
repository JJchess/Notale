from pathlib import Path

from PIL import Image, ImageDraw


root = Path(__file__).parent
shots = [Image.open(root / "screenshots" / f"page{i}.png").convert("RGB") for i in range(15)]
thumbs = []
for index, shot in enumerate(shots, start=1):
    width = 480
    height = round(shot.height * width / shot.width)
    thumb = shot.resize((width, height))
    framed = Image.new("RGB", (width, height + 28), "white")
    framed.paste(thumb, (0, 28))
    ImageDraw.Draw(framed).text((8, 7), f"Page {index}", fill="black")
    thumbs.append(framed)

cell_w = max(image.width for image in thumbs)
cell_h = max(image.height for image in thumbs)
montage = Image.new("RGB", (cell_w * 5, cell_h * 3), "#d9d9d9")
for index, thumb in enumerate(thumbs):
    montage.paste(thumb, ((index % 5) * cell_w, (index // 5) * cell_h))
montage.save(root / "montage.png")
