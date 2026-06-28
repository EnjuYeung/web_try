from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).parent
SOURCE = ROOT / "poster-landing-source.png"
OUTPUT = ROOT / "poster-landing-concept.gif"

WIDTH = 960
HEIGHT = 540
FRAME_COUNT = 42
FRAME_DURATION_MS = 70
POSTER_WIDTH = 112
POSTER_HEIGHT = 168
GAP = 12

# Approximate poster bounds in the generated concept source.
POSTER_BOXES = [
    (20, 30, 179, 293),
    (191, 30, 346, 293),
    (358, 30, 510, 293),
    (522, 30, 676, 293),
    (688, 30, 842, 293),
    (852, 30, 1007, 293),
    (1017, 30, 1171, 293),
    (1182, 30, 1335, 293),
    (1347, 30, 1501, 293),
    (1512, 30, 1662, 293),
    (15, 340, 153, 596),
    (164, 340, 301, 596),
    (312, 340, 453, 596),
    (464, 340, 596, 596),
    (1040, 340, 1174, 596),
    (1185, 340, 1321, 596),
    (1332, 340, 1465, 596),
    (1476, 340, 1586, 596),
    (1597, 340, 1663, 596),
    (15, 641, 159, 891),
    (174, 641, 335, 891),
    (346, 641, 499, 891),
    (512, 641, 665, 891),
    (676, 641, 841, 891),
    (852, 641, 1004, 891),
    (1016, 641, 1169, 891),
    (1181, 641, 1333, 891),
    (1345, 641, 1498, 891),
    (1510, 641, 1663, 891),
]


def rounded_poster(image):
    fitted = image.resize((POSTER_WIDTH, POSTER_HEIGHT), Image.Resampling.LANCZOS)
    mask = Image.new("L", fitted.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, POSTER_WIDTH - 1, POSTER_HEIGHT - 1), radius=9, fill=255)
    result = Image.new("RGBA", fitted.size)
    result.paste(fitted.convert("RGBA"), mask=mask)
    return result


def make_track(posters, seed):
    ordered = list(posters)
    Random(seed).shuffle(ordered)
    period = len(ordered) * (POSTER_WIDTH + GAP)
    track = Image.new("RGBA", (period, POSTER_HEIGHT), (5, 7, 10, 255))
    for index, poster in enumerate(ordered):
        track.alpha_composite(poster, (index * (POSTER_WIDTH + GAP), 0))
    return track


def paste_scrolling_track(frame, track, y, progress, direction=1, speed=1):
    period = track.width
    tiled = Image.new("RGBA", (period * 3, POSTER_HEIGHT), (5, 7, 10, 255))
    tiled.alpha_composite(track, (0, 0))
    tiled.alpha_composite(track, (period, 0))
    tiled.alpha_composite(track, (period * 2, 0))
    offset = int(progress * period * speed) % period
    if direction < 0:
        offset = (period - offset) % period
    crop = tiled.crop((period + offset, 0, period + offset + WIDTH, POSTER_HEIGHT))
    frame.alpha_composite(crop, (0, y))


def center_overlay():
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    pixels = overlay.load()
    center_x = WIDTH / 2
    center_y = HEIGHT / 2
    for y in range(HEIGHT):
        for x in range(WIDTH):
            horizontal = max(0.0, 1.0 - abs(x - center_x) / 350)
            vertical = max(0.0, 1.0 - abs(y - center_y) / 250)
            edge = max(abs(x - center_x) / center_x, abs(y - center_y) / center_y)
            alpha = int(220 * horizontal * vertical + 70 * edge)
            pixels[x, y] = (2, 4, 7, min(232, alpha))
    return overlay.filter(ImageFilter.GaussianBlur(18))


def draw_interface(frame):
    draw = ImageDraw.Draw(frame)
    brand_font = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 52, index=1)
    subtitle_font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 17)
    button_font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 16)

    brand = "Juen's"
    subtitle = "从收藏里，随机遇见下一部电影"
    button = "进入电影库   →"

    brand_box = draw.textbbox((0, 0), brand, font=brand_font)
    subtitle_box = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    draw.text(((WIDTH - (brand_box[2] - brand_box[0])) / 2, 203), brand, font=brand_font, fill=(250, 250, 250))
    draw.text(
        ((WIDTH - (subtitle_box[2] - subtitle_box[0])) / 2, 270),
        subtitle,
        font=subtitle_font,
        fill=(187, 194, 204),
    )

    button_box = (385, 321, 575, 369)
    draw.rounded_rectangle(button_box, radius=24, fill=(242, 244, 247), outline=(255, 255, 255, 220), width=1)
    text_box = draw.textbbox((0, 0), button, font=button_font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    draw.text(
        ((WIDTH - text_width) / 2, 345 - text_height / 2 - text_box[1]),
        button,
        font=button_font,
        fill=(15, 18, 23),
    )

    draw.text((24, 22), "RANDOM POSTER WALL", font=ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 11), fill=(155, 163, 176))
    draw.ellipse((921, 25, 927, 31), fill=(221, 71, 58))
    draw.ellipse((935, 25, 941, 31), fill=(226, 171, 52))


def main():
    source = Image.open(SOURCE).convert("RGB")
    posters = [rounded_poster(source.crop(box)) for box in POSTER_BOXES]
    tracks = [make_track(posters, seed) for seed in (7, 19, 31)]
    overlay = center_overlay()
    frames = []

    for index in range(FRAME_COUNT):
        progress = index / FRAME_COUNT
        frame = Image.new("RGBA", (WIDTH, HEIGHT), (5, 7, 10, 255))
        paste_scrolling_track(frame, tracks[0], -54, progress, direction=1, speed=1)
        paste_scrolling_track(frame, tracks[1], 186, progress, direction=-1, speed=1)
        paste_scrolling_track(frame, tracks[2], 426, progress, direction=1, speed=1)
        frame.alpha_composite(overlay)
        draw_interface(frame)
        frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))

    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        optimize=True,
        disposal=2,
    )


if __name__ == "__main__":
    main()
