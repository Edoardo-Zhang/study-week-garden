# -*- coding: utf-8 -*-
"""生成桌面应用图标：绿色圆角底 + 白色「周」字 + 底部七日条。
4 倍超采样后缩放，保证小尺寸也清晰。"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build")
OUT_DIR = os.path.abspath(OUT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)

S = 1024                      # 超采样画布
TOP = (0x6C, 0xB6, 0x90)      # 站点主色偏亮
BOT = (0x3B, 0x74, 0x56)      # 站点主色偏深
FONT = r"C:\Windows\Fonts\msyhbd.ttc"

# 1) 竖向渐变底
grad = Image.new("RGB", (S, S))
d = ImageDraw.Draw(grad)
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=(
        round(TOP[0] + (BOT[0] - TOP[0]) * t),
        round(TOP[1] + (BOT[1] - TOP[1]) * t),
        round(TOP[2] + (BOT[2] - TOP[2]) * t),
    ))

# 2) 圆角遮罩
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 5, fill=255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(grad, (0, 0), mask)
dr = ImageDraw.Draw(img)

# 3) 顶部高光：必须用 alpha_composite 叠加（ImageDraw 在 RGBA 上是覆盖，会把底挖成透明洞）
hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(hl).ellipse([-S * 0.35, -S * 0.75, S * 1.35, S * 0.35], fill=(255, 255, 255, 22))
img = Image.alpha_composite(img, hl)
dr = ImageDraw.Draw(img)

# 4) 白色「周」字
font = ImageFont.truetype(FONT, int(S * 0.44))
box = dr.textbbox((0, 0), "周", font=font)
tw, th = box[2] - box[0], box[3] - box[1]
dr.text(((S - tw) / 2 - box[0], S * 0.44 - th / 2 - box[1]), "周", font=font, fill=(255, 255, 255, 255))

# 5) 底部七日条：7 个白色圆点，第 6 个更亮（呼应站点“周六=今天”）
dot = int(S * 0.045)
gap = int(S * 0.028)
total = 7 * dot + 6 * gap
x0 = (S - total) / 2
y0 = S * 0.80
for i in range(7):
    x = x0 + i * (dot + gap)
    alpha = 255 if i == 5 else 150
    dr.rounded_rectangle([x, y0, x + dot, y0 + dot], radius=dot // 2, fill=(255, 255, 255, alpha))

# 6) 输出：256 PNG 预览 + 多尺寸 ICO
preview = img.resize((256, 256), Image.LANCZOS)
png_path = os.path.join(OUT_DIR, "icon-preview.png")
preview.save(png_path)

ico_path = os.path.join(OUT_DIR, "icon.ico")
img.save(ico_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print("preview:", png_path, os.path.getsize(png_path), "bytes")
print("ico    :", ico_path, os.path.getsize(ico_path), "bytes")
with Image.open(ico_path) as ic:
    print("ico sizes:", sorted(ic.info.get("sizes", [])))
# 7) 生成 256/48/32/16 对比条，人工检查小尺寸可读性
strip = Image.new("RGBA", (256 + 48 + 32 + 16 + 30, 256), (245, 245, 245, 255))
x = 0
for size in (256, 48, 32, 16):
    ic = preview.resize((size, size), Image.LANCZOS)
    strip.alpha_composite(ic, (x, 0 if size == 256 else 256 - size))
    x += size + 10
strip_path = os.path.join(OUT_DIR, "icon-strip.png")
strip.save(strip_path)
print("strip  :", strip_path, os.path.getsize(strip_path), "bytes")