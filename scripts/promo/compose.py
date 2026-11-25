"""Turns the captured AccessAI screenshots into a captioned 1080p promo video.

Usage: python3 compose.py <capture_dir> <out.mp4>
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
NAVY = (11, 21, 51)
YELLOW = (248, 214, 9)
WHITE = (255, 255, 255)
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_SEMI = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

src = Path(sys.argv[1])
out = Path(sys.argv[2])
frames = src / "frames"
frames.mkdir(exist_ok=True)
shots = json.loads((src / "shots.json").read_text())
CHARS = {n: Image.open(src / f"char-{n}.png").convert("RGBA") for n in ("sam", "mia", "grace")}


def avatar(name, size):
    """Round head-and-shoulders crop of a character."""
    im = CHARS[name].crop((150, 150, 750, 750)).resize((size, size), Image.LANCZOS)
    bg = Image.new("RGBA", (size, size), (*NAVY, 255))
    bg.alpha_composite(im)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, f, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def centred(draw, lines, f, top, fill, gap):
    y = top
    for ln in lines:
        x = (W - draw.textlength(ln, font=f)) / 2
        draw.text((x, y), ln, font=f, fill=fill)
        y += f.size + gap
    return y


def left_text(draw, lines, f, x, top, fill, gap):
    y = top
    for ln in lines:
        draw.text((x, y), ln, font=f, fill=fill)
        y += f.size + gap
    return y


def card(item):
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    who = item.get("who")
    if who:
        ch = CHARS[who].resize((1000, 1000), Image.LANCZOS)
        im.paste(ch, (-60, H - 1000 + 40), ch)
        tf, sf = font(FONT_BOLD, 110), font(FONT_SEMI, 52)
        tl = wrap(d, item["title"], tf, 900)
        sl = wrap(d, item["sub"], sf, 900)
        total = len(tl) * (tf.size + 16) + 40 + len(sl) * (sf.size + 14)
        y = (H - total) / 2
        y = left_text(d, tl, tf, 940, y, WHITE, 16) + 40
        left_text(d, sl, sf, 940, y, YELLOW, 14)
        return im
    big = item["title"] == "AccessAI"
    if big:
        for i, n in enumerate(("sam", "mia", "grace")):
            ch = CHARS[n].resize((560, 560), Image.LANCZOS)
            im.paste(ch, (100 + i * 580, H - 520), ch)
    tf = font(FONT_BOLD, 200 if big else 120)
    sf = font(FONT_SEMI, 64 if big else 52)
    tl = wrap(d, item["title"], tf, 1600)
    sl = wrap(d, item["sub"], sf, 1500)
    total = len(tl) * (tf.size + 20) + 40 + len(sl) * (sf.size + 16)
    y = (H - total) / 2 - (230 if big else 0)
    y = centred(d, tl, tf, y, WHITE, 20) + 40
    centred(d, sl, sf, y, YELLOW, 16)
    return im


def shot(item, who):
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    site = Image.open(item["site"]).convert("RGB")
    panel = Image.open(item["panel"]).convert("RGB")
    area_h, gap = 830, 16
    scale = area_h / site.height
    sw, pw = int(site.width * scale), int(panel.width * scale)
    if sw + pw + gap > W - 80:
        scale = (W - 80 - gap) / (site.width + panel.width)
        sw, pw, area_h = int(site.width * scale), int(panel.width * scale), int(site.height * scale)
    site = site.resize((sw, area_h), Image.LANCZOS)
    panel = panel.resize((pw, area_h), Image.LANCZOS)
    x0 = (W - (sw + gap + pw)) // 2
    y0 = 30
    im.paste(site, (x0, y0))
    im.paste(panel, (x0 + sw + gap, y0))
    # Yellow outline marks the AccessAI panel.
    d.rectangle([x0 + sw + gap - 4, y0 - 4, x0 + sw + gap + pw + 3, y0 + area_h + 3], outline=YELLOW, width=4)
    # Caption bar: large, high-contrast text.
    bar_top = y0 + area_h + 20
    d.rectangle([0, bar_top, W, H], fill=(0, 0, 0))
    av = avatar(who, H - bar_top - 30)
    im.paste(av, (40, bar_top + 15), av)
    cf = font(FONT_BOLD, 48)
    tx = 40 + av.width + 40
    lines = wrap(d, item["caption"], cf, W - tx - 60)
    total = len(lines) * (cf.size + 10)
    left_text(d, lines, cf, tx, bar_top + (H - bar_top - total) / 2 - 6, WHITE, 10)
    return im


segments = []
who = "sam"
for i, item in enumerate(shots):
    if item["kind"] == "card":
        who = item.get("who") or who
        im = card(item)
    else:
        im = shot(item, who)
    p = frames / f"{i:02d}.png"
    im.save(p)
    segments.append((p, item["seconds"]))

inputs, filters = [], []
for i, (p, secs) in enumerate(segments):
    inputs += ["-loop", "1", "-t", str(secs), "-framerate", "30", "-i", str(p)]
    filters.append(
        f"[{i}:v]scale={W}:{H},format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st={secs - 0.35}:d=0.35[v{i}]"
    )
concat = "".join(f"[v{i}]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=1:a=0[v]"
total = sum(s for _, s in segments)
cmd = [
    "ffmpeg", "-y", *inputs,
    "-f", "lavfi", "-t", str(total), "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex", ";".join(filters) + ";" + concat,
    "-map", "[v]", "-map", f"{len(segments)}:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(out),
]
subprocess.run(cmd, check=True, capture_output=True)
print(f"wrote {out} ({total:.1f}s, {len(segments)} segments)")
