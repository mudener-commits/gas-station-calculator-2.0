"""Render the mini-program's 5:4 WeChat share card with exact Chinese labels.

Requires Pillow. Run from any directory: python3 scripts/render_share_card.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "images/share-card-5x4.png"
LOGO = ROOT / "images/miniprogram-profit-icon-512.png"
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
SIZE = (1000, 800)


def font(size):
    return ImageFont.truetype(FONT, size)


def centered(draw, box, label, face, fill):
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), label, font=face)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.text(((left + right - width) / 2 - bounds[0],
               (top + bottom - height) / 2 - bounds[1]), label,
              font=face, fill=fill)


def rounded_gradient(image, box, top_color, bottom_color, radius):
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    layer = Image.new("RGB", (width, height))
    pixels = layer.load()
    for y in range(height):
        weight = y / max(height - 1, 1)
        color = tuple(round(a * (1 - weight) + b * weight)
                      for a, b in zip(top_color, bottom_color))
        for x in range(width):
            pixels[x, y] = color
    mask = Image.new("L", (width, height))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius, fill=255)
    image.paste(layer, (left, top), mask)


def profit_icon(draw, x, y, color):
    draw.line([(x + 18, y + 68), (x + 18, y + 28)], fill=color, width=7)
    draw.line([(x + 18, y + 68), (x + 76, y + 68)], fill=color, width=7)
    draw.line([(x + 26, y + 58), (x + 42, y + 45), (x + 53, y + 51), (x + 74, y + 23)], fill=color, width=8, joint="curve")
    draw.polygon([(x + 66, y + 22), (x + 80, y + 17), (x + 76, y + 32)], fill=color)


def investment_icon(draw, x, y, color):
    draw.rounded_rectangle((x + 22, y + 15, x + 68, y + 76), 8, outline=color, width=6)
    draw.line((x + 32, y + 33, x + 57, y + 33), fill=color, width=6)
    draw.line((x + 32, y + 46, x + 49, y + 46), fill=color, width=5)
    draw.ellipse((x + 57, y + 51, x + 84, y + 78), fill="white", outline=color, width=5)
    centered(draw, (x + 58, y + 52, x + 83, y + 78), "¥", font(23), color)


def balance_icon(draw, x, y, color):
    draw.line((x + 46, y + 20, x + 46, y + 68), fill=color, width=7)
    draw.line((x + 24, y + 69, x + 69, y + 69), fill=color, width=7)
    draw.line((x + 20, y + 31, x + 72, y + 31), fill=color, width=6)
    draw.ellipse((x + 42, y + 15, x + 50, y + 23), fill=color)
    draw.line((x + 25, y + 31, x + 19, y + 54), fill=color, width=4)
    draw.line((x + 68, y + 31, x + 74, y + 54), fill=color, width=4)
    draw.arc((x + 9, y + 43, x + 30, y + 65), 0, 180, fill=color, width=5)
    draw.arc((x + 64, y + 43, x + 85, y + 65), 0, 180, fill=color, width=5)


def marketing_icon(draw, x, y, color):
    draw.polygon([(x + 17, y + 36), (x + 37, y + 36), (x + 69, y + 22),
                  (x + 69, y + 66), (x + 37, y + 54), (x + 17, y + 54)],
                 fill=color)
    draw.polygon([(x + 30, y + 57), (x + 43, y + 57), (x + 49, y + 76),
                  (x + 37, y + 76)], fill=color)
    draw.arc((x + 62, y + 28, x + 89, y + 61), -62, 62, fill=color, width=5)


def render():
    background = Image.new("RGB", SIZE)
    pixels = background.load()
    for y in range(SIZE[1]):
        for x in range(SIZE[0]):
            pixels[x, y] = (max(223, 242 - y // 45), max(235, 248 - y // 72), 255)

    shadow = Image.new("RGBA", SIZE)
    ImageDraw.Draw(shadow).rounded_rectangle((22, 24, 978, 780), 45, fill=(35, 112, 199, 45))
    background = Image.alpha_composite(background.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(background)
    draw.rounded_rectangle((18, 16, 982, 784), 46, fill="white")
    draw.rounded_rectangle((18, 16, 982, 784), 46, outline="#d3e7fb", width=2)

    # Existing mini-program logo, with its original blue square preserved.
    logo = Image.open(LOGO).convert("RGB").crop((16, 16, 496, 496)).resize((148, 148), Image.Resampling.LANCZOS)
    background.paste(logo, (64, 70))
    draw = ImageDraw.Draw(background)
    navy = "#092b5b"
    draw.text((238, 68), "加油（加气）站", font=font(58), fill=navy, stroke_width=1)
    draw.text((238, 135), "利润·投资专用计算器", font=font(52), fill=navy, stroke_width=1)
    draw.text((240, 217), "免费测算·本地计算·数据安全", font=font(31), fill="#32699a")
    rounded_gradient(background, (855, 61, 949, 119), (60, 145, 255), (0, 94, 237), 29)
    draw = ImageDraw.Draw(background)
    centered(draw, (855, 61, 949, 119), "3.0", font(35), "white")
    draw.line((65, 274, 935, 274), fill="#e3eef9", width=2)

    cards = [
        (65, 304, "利润测算", "算清经营账", "#126cf2", "#ecf4ff", profit_icon),
        (510, 304, "投资回报", "看清回本期", "#0b9a78", "#e8f8f2", investment_icon),
        (65, 480, "盈亏平衡销量", "倒推每日销量", "#e47620", "#fff2e8", balance_icon),
        (510, 480, "营销活动保利", "测算活动销量", "#7655d9", "#f3efff", marketing_icon),
    ]
    for x, y, title, caption, color, pale, icon in cards:
        draw.rounded_rectangle((x + 3, y + 6, x + 428, y + 158), 27, fill="#e9f2fa")
        draw.rounded_rectangle((x, y, x + 425, y + 152), 27, fill="white", outline="#d7e8f6", width=2)
        draw.rounded_rectangle((x + 22, y + 27, x + 122, y + 127), 23, fill=pale)
        icon(draw, x + 26, y + 30, color)
        draw.text((x + 145, y + 37), title, font=font(38 if len(title) > 4 else 42), fill=color)
        draw.text((x + 145, y + 90), caption, font=font(27), fill="#66809b")

    rounded_gradient(background, (65, 672, 935, 758), (52, 131, 252), (0, 92, 232), 43)
    draw = ImageDraw.Draw(background)
    centered(draw, (65, 672, 935, 758), "立即测算  ›", font(43), "white")
    background.convert("RGB").resize((500, 400), Image.Resampling.LANCZOS).save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    render()
