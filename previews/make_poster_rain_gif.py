from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).parent
SOURCE = ROOT / "poster-rain-source.png"
OUTPUT = ROOT / "poster-rain-concept.gif"

WIDTH, HEIGHT = 960, 540
FRAMES = 80
DURATION_MS = 140
CARD_W, CARD_H = 126, 190
VERTICAL_STEP = 124
COLUMN_X = (-58, 53, 164, 275, 386, 497, 608, 719, 830)

BOXES = [
    (0, 0, 105, 230),
    (185, 27, 328, 221),
    (394, 0, 544, 195),
    (304, 164, 449, 432),
    (160, 319, 269, 575),
    (425, 319, 578, 588),
    (235, 498, 375, 765),
    (32, 646, 173, 891),
    (174, 752, 303, 944),
    (328, 627, 473, 913),
    (453, 737, 592, 944),
    (1008, 0, 1152, 280),
    (1241, 0, 1397, 213),
    (1475, 0, 1616, 219),
    (1112, 180, 1255, 454),
    (1256, 221, 1401, 387),
    (1512, 222, 1654, 469),
    (1008, 341, 1128, 600),
    (1208, 419, 1335, 627),
    (1407, 389, 1514, 621),
    (1093, 514, 1230, 762),
    (989, 625, 1121, 891),
    (1312, 534, 1454, 793),
    (1536, 535, 1678, 867),
    (1200, 717, 1305, 944),
    (1418, 762, 1556, 944),
]


def make_card(crop):
    card = crop.resize((CARD_W, CARD_H), Image.Resampling.LANCZOS).convert("RGBA")
    green = Image.new("RGBA", card.size, (11, 52, 38, 34))
    card = Image.alpha_composite(card, green)
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, CARD_W - 2, CARD_H - 2), 8, fill=255)
    rounded = Image.new("RGBA", card.size)
    rounded.paste(card, mask=mask)
    ImageDraw.Draw(rounded).rounded_rectangle(
        (1, 1, CARD_W - 2, CARD_H - 2),
        8,
        outline=(87, 130, 112, 105),
        width=1,
    )
    return rounded


def composite_card(frame, card, x, y):
    shadow = Image.new("RGBA", (CARD_W + 24, CARD_H + 28), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((12, 10, CARD_W + 12, CARD_H + 10), 10, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    frame.alpha_composite(shadow, (x - 12, y - 8))
    frame.alpha_composite(card, (x, y))


def draw_code_rain(frame, progress):
    draw = ImageDraw.Draw(frame)
    rng = Random(82)
    for _ in range(48):
        x = rng.randrange(WIDTH)
        length = rng.randrange(22, 130)
        speed = rng.uniform(0.4, 1.1)
        y = int((rng.randrange(HEIGHT) + progress * HEIGHT * speed) % (HEIGHT + length)) - length
        alpha = rng.randrange(18, 55)
        draw.line((x, y, x, y + length), fill=(32, 176, 112, alpha), width=1)
        draw.ellipse((x - 1, y + length - 2, x + 1, y + length), fill=(95, 236, 174, alpha + 20))


def make_center_shade():
    shade = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    pixels = shade.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            dx = abs(x - WIDTH / 2) / 255
            dy = abs(y - HEIGHT / 2) / 250
            focus = max(0.0, 1.0 - dx) * max(0.15, 1.0 - dy)
            edge = max(abs(x - WIDTH / 2) / (WIDTH / 2), abs(y - HEIGHT / 2) / (HEIGHT / 2))
            pixels[x, y] = (0, 4, 3, min(238, int(228 * focus + 42 * edge)))
    return shade.filter(ImageFilter.GaussianBlur(16))


def draw_interface(frame):
    draw = ImageDraw.Draw(frame)
    brand_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 50, index=1)
    cn_font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 16)
    small_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 10)
    button_font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 15)

    brand = "Juen's"
    subtitle = "让海报流过，直到一部电影留下"
    brand_w = draw.textbbox((0, 0), brand, font=brand_font)[2]
    subtitle_w = draw.textbbox((0, 0), subtitle, font=cn_font)[2]

    draw.text(((WIDTH - brand_w) / 2, 207), brand, font=brand_font, fill=(239, 246, 242))
    draw.text(((WIDTH - subtitle_w) / 2, 270), subtitle, font=cn_font, fill=(153, 180, 168))

    button_box = (391, 319, 569, 365)
    draw.rounded_rectangle(button_box, 23, fill=(226, 237, 231), outline=(106, 170, 142, 170), width=1)
    button = "进入电影库  ↓"
    box = draw.textbbox((0, 0), button, font=button_font)
    draw.text(
        ((WIDTH - (box[2] - box[0])) / 2, 342 - (box[3] - box[1]) / 2 - box[1]),
        button,
        font=button_font,
        fill=(8, 26, 19),
    )

    draw.text((22, 20), "POSTER STREAM / 01", font=small_font, fill=(91, 139, 119))
    draw.line((22, 38, 123, 38), fill=(39, 104, 78), width=1)


def main():
    source = Image.open(SOURCE).convert("RGB")
    cards = [make_card(source.crop(box)) for box in BOXES]
    columns = []
    for index in range(len(COLUMN_X)):
        chosen = list(cards)
        Random(100 + index).shuffle(chosen)
        columns.append(chosen[:8])

    center_shade = make_center_shade()
    frames = []
    period = VERTICAL_STEP * 8

    for frame_index in range(FRAMES):
        progress = frame_index / FRAMES
        frame = Image.new("RGBA", (WIDTH, HEIGHT), (1, 7, 5, 255))
        draw_code_rain(frame, progress)

        for column_index, (x, column) in enumerate(zip(COLUMN_X, columns)):
            direction = 1 if column_index % 2 == 0 else -1
            phase = (column_index * 0.137) % 1
            offset = ((progress * direction + phase) % 1) * period
            for repeat in range(-2, 2):
                for card_index, card in enumerate(column):
                    y = int(card_index * VERTICAL_STEP + repeat * period + offset - CARD_H)
                    if -CARD_H - 20 < y < HEIGHT + 20:
                        composite_card(frame, card, x, y)

        frame.alpha_composite(center_shade)
        draw_interface(frame)
        frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))

    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        optimize=True,
        disposal=2,
    )


if __name__ == "__main__":
    main()
