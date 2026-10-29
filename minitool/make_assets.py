# -*- coding: utf-8 -*-
"""Generate the creator-platform icon (1:1) and cover (3:4)."""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHOT = os.path.join(ROOT, "upload_assets", "screenshots", "01-cover.png")
COVER = os.path.join(HERE, "cover-1080x1440.png")
ICON = os.path.join(HERE, "icon-512.png")

FONT_DIR = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
FONT_BOLD = os.path.join(FONT_DIR, "msyhbd.ttc")
FONT_MONO = os.path.join(FONT_DIR, "consola.ttf")


def cover():
    im = Image.open(SHOT).convert("RGB")
    if im.size != (1080, 1920):
        raise SystemExit("unexpected screenshot size: %s" % (im.size,))
    im.crop((0, 300, 1080, 1740)).save(COVER)
    print("cover:", COVER, Image.open(COVER).size)


def icon():
    size = 512
    im = Image.new("RGB", (size, size), "#08090b")
    d = ImageDraw.Draw(im)

    for x in range(0, size, 64):
        d.line([(x, 0), (x, size)], fill=(255, 255, 255, 13), width=1)
    for y in range(0, size, 64):
        d.line([(0, y), (size, y)], fill=(255, 255, 255, 13), width=1)

    d.rectangle([0, 0, size, 10], fill="#ff4b2f")
    d.ellipse([300, 96, 448, 244], outline="#ff4b2f", width=4)
    d.ellipse([322, 118, 426, 222], outline=(255, 75, 47, 90), width=2)

    f_p0 = ImageFont.truetype(FONT_MONO, 196)
    f_cn = ImageFont.truetype(FONT_BOLD, 44)
    f_sub = ImageFont.truetype(FONT_BOLD, 24)
    f_mono = ImageFont.truetype(FONT_MONO, 20)

    d.text((44, 84), "P0", font=f_p0, fill="#f2eee6")
    d.text((44, 294), "事故剧本杀", font=f_cn, fill="#f2eee6")
    d.text((46, 354), "谁动了档案库", font=f_sub, fill="#a3a7ae")
    d.text((46, 456), "1024 SEC / 9 AGENTS", font=f_mono, fill="#ff4b2f")

    im.save(ICON)
    print("icon:", ICON, Image.open(ICON).size)


if __name__ == "__main__":
    cover()
    icon()
