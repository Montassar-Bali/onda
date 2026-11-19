"""Exports the ONDA logo (already transparent) for the web and PDFs: trimmed to its pixels.
Usage: python3 scripts/cutout-logo.py public/brand/onda-source.webp public/brand
"""
import sys
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
bbox = im.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
pad = 4
im = im.crop((max(bbox[0] - pad, 0), max(bbox[1] - pad, 0), min(bbox[2] + pad, im.width), min(bbox[3] + pad, im.height)))
im.save(f"{out_dir}/onda-logo.png", optimize=True)
small = im.copy(); small.thumbnail((720, 720), Image.LANCZOS); small.save(f"{out_dir}/onda-logo-720.png", optimize=True)
print("logo", im.size, "small", small.size)
