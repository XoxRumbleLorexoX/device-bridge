#!/usr/bin/env python3
"""Regenerate original geometric fixture icons; optional Pillow build dependency."""
from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).resolve().parents[1] / 'fixture/Resources'
output.mkdir(exist_ok=True)
for scale in (1, 2, 3):
    size = 60 * scale
    supersampling = 4
    image = Image.new('RGB', (size * supersampling, size * supersampling), '#132B46')
    draw = ImageDraw.Draw(image)
    for coordinates, color in [((11, 27, 49, 33), '#54D6BE'), ((15, 17, 21, 45), '#FFFFFF'),
                               ((39, 17, 45, 45), '#FFFFFF'), ((19, 20, 41, 25), '#FFFFFF'),
                               ((8, 43, 52, 47), '#54D6BE')]:
        draw.rectangle(tuple(round(v * size * supersampling / 60) for v in coordinates), fill=color)
    suffix = '' if scale == 1 else '@' + str(scale) + 'x'
    image.resize((size, size), Image.Resampling.LANCZOS).save(output / ('AppIcon60' + suffix + '.png'))
