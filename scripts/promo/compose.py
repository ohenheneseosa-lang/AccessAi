"""Turns the captured AccessAI screenshots into a captioned 1080p promo video.

Usage: python3 compose.py <capture_dir> <out.mp4>

If <capture_dir> has clip-<name>.mp4 (8s clips made in Google Flow), each persona opens with
that clip and a title overlay, and stills from the clips replace the stock photos.
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
# Real photos of people (free Pexels licence, see CREDITS.md). fetch-photos.sh saves them as
# photo-<name>.jpg. face = (centre x, centre y, box size) for the round avatar; focus = the
# point the card crop keeps in view. Coordinates are for the 1400px-wide downloads.
PEOPLE = {
    "sam": {"face": (528, 470, 420), "focus": (560, 1150)},
    "mia": {"face": (718, 600, 560), "focus": (700, 1150)},
    "grace": {"face": (860, 300, 460), "focus": (900, 466)},
}
# Same idea for stills grabbed from the Flow clips (1280x720, frame at 2s).
CLIP_PEOPLE = {
    "sam": {"face": (760, 118, 270), "focus": (700, 360)},
    "mia": {"face": (560, 215, 300), "focus": (560, 360)},
    "grace": {"face": (705, 265, 300), "focus": (820, 360)},
}



def kenburns(name):
    """Builds an 8s clip from two stills (kb-<name>-1.png, kb-<name>-2.png) with a slow push-in
    and a crossfade, for when a Flow clip can't be downloaded but stills can be captured."""
    a, b, clip = src / f"kb-{name}-1.png", src / f"kb-{name}-2.png", src / f"clip-{name}.mp4"
    zp = "scale=2560:1440,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=135:s=1280x720:fps=30"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", "4.5", "-i", str(a), "-loop", "1", "-t", "4.5", "-i", str(b),
        "-filter_complex", f"[0:v]{zp}[x];[1:v]{zp}[y];[x][y]xfade=transition=fade:duration=1:offset=3.5,format=yuv420p[v]",
        "-map", "[v]", "-t", "8", "-c:v", "libx264", "-crf", "18", str(clip),
    ], check=True)


for _n in PEOPLE:
    if not (src / f"clip-{_n}.mp4").exists() and (src / f"kb-{_n}-1.png").exists():
        kenburns(_n)
CLIPS = {n: src / f"clip-{n}.mp4" for n in PEOPLE if (src / f"clip-{n}.mp4").exists()}
PHOTOS = {}
for n in PEOPLE:
    if n in CLIPS:
        still = src / f"still-{n}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2", "-i", str(CLIPS[n]), "-frames:v", "1", str(still)], check=True)
        PHOTOS[n] = Image.open(still).convert("RGB")
        PEOPLE[n] = CLIP_PEOPLE[n]
    else:
        PHOTOS[n] = Image.open(src / f"photo-{n}.jpg").convert("RGB")


def cover(name, w, h):
    """Crop a photo to fill w x h, keeping the person's focus point in view."""
    im = PHOTOS[name]
    scale = max(w / im.width, h / im.height)
    cw, ch = w / scale, h / scale
    fx, fy = PEOPLE[name]["focus"]
    x = min(max(fx - cw / 2, 0), im.width - cw)
    y = min(max(fy - ch / 2, 0), im.height - ch)
    return im.crop((int(x), int(y), int(x + cw), int(y + ch))).resize((w, h), Image.LANCZOS)


def avatar(name, size):
    """Round head-and-shoulders crop of the person."""
    cx, cy, s = PEOPLE[name]["face"]
    im = PHOTOS[name].crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((size, size), Image.LANCZOS)
    bg = im.convert("RGBA")
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
        pw = 880
        im.paste(cover(who, pw, H), (0, 0))
        # Soft fade from the photo into the navy text side.
        fade = Image.new("L", (160, H))
        for x in range(160):
            ImageDraw.Draw(fade).line([(x, 0), (x, H)], fill=int(255 * x / 159))
        im.paste(Image.new("RGB", (160, H), NAVY), (pw - 160, 0), fade)
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
            ph = cover(n, 520, 420)
            mask = Image.new("L", ph.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, 519, 419], 28, fill=255)
            im.paste(ph, (150 + i * 560, H - 480), mask)
    tf = font(FONT_BOLD, 200 if big else 120)
    sf = font(FONT_SEMI, 64 if big else 52)
    tl = wrap(d, item["title"], tf, 1600)
    sl = wrap(d, item["sub"], sf, 1500)
    total = len(tl) * (tf.size + 20) + 40 + len(sl) * (sf.size + 16)
    y = (H - total) / 2 - (230 if big else 0)
    y = centred(d, tl, tf, y, WHITE, 20) + 40
    y = centred(d, sl, sf, y, YELLOW, 16)
    if item.get("cta"):
        centred(d, [item["cta"]], font(FONT_BOLD, 56), y + 20, WHITE, 0)
    if item.get("small"):
        smf = font(FONT_SEMI, 30)
        centred(d, [item["small"]], smf, H - 48, (200, 205, 220), 0)
    return im


def title_overlay(item):
    """Transparent 1080p overlay: dark band at the bottom with the persona title."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    band = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(band)
    for y in range(560, H):
        bd.line([(0, y), (W, y)], fill=min(235, int(235 * (y - 560) / 220)))
    im.paste(Image.new("RGBA", (W, H), (*NAVY, 255)), (0, 0), band)
    d = ImageDraw.Draw(im)
    tf, sf = font(FONT_BOLD, 96), font(FONT_SEMI, 48)
    sl = wrap(d, item["sub"], sf, 1500)
    y = H - 70 - len(sl) * (sf.size + 12) - 30 - tf.size
    d.text((90, y), item["title"], font=tf, fill=WHITE)
    left_text(d, sl, sf, 90, y + tf.size + 30, YELLOW, 12)
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
    p = frames / f"{i:02d}.png"
    if item["kind"] == "card":
        who = item.get("who") or who
        if item.get("who") in CLIPS:
            title_overlay(item).save(p)
            segments.append((p, 8.0, CLIPS[who]))
            continue
        im = card(item)
    else:
        im = shot(item, who)
    im.save(p)
    segments.append((p, item["seconds"], None))



def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


# Voice-over: optional vo/vo-NN.(aiff|wav|mp3), one line per segment. A segment is stretched so its
# line fits with a short pause after it.
VO = {}
for i in range(len(segments)):
    for ext in ("aiff", "wav", "mp3", "m4a"):
        f = src / "vo" / f"vo-{i:02d}.{ext}"
        if f.exists():
            VO[i] = (f, duration(f))
            break
for i, (f, d) in VO.items():
    p_, secs, clip = segments[i]
    need = round(d + 0.9, 2)
    if need > secs:
        if clip:
            print(f"note: line {i:02d} is {d:.1f}s, longer than its clip")
        else:
            segments[i] = (p_, need, clip)

inputs, filters, idx = [], [], 0
for i, (p, secs, clip) in enumerate(segments):
    fade = f"fade=t=in:st=0:d=0.35,fade=t=out:st={secs - 0.35}:d=0.35"
    if clip:
        # Flow clip (its own audio is dropped) with the title fading in over it after 1.5s.
        inputs += ["-t", str(secs), "-i", str(clip), "-loop", "1", "-t", str(secs), "-framerate", "30", "-i", str(p)]
        filters.append(
            f"[{idx}:v]scale={W}:{H},fps=30,setsar=1[c{i}];"
            f"[{idx + 1}:v]format=rgba,fade=t=in:st=1.5:d=0.6:alpha=1[t{i}];"
            f"[c{i}][t{i}]overlay=0:0,format=yuv420p,{fade}[v{i}]"
        )
        idx += 2
    else:
        inputs += ["-loop", "1", "-t", str(secs), "-framerate", "30", "-i", str(p)]
        filters.append(f"[{idx}:v]scale={W}:{H},setsar=1,format=yuv420p,{fade}[v{i}]")
        idx += 1
concat = "".join(f"[v{i}]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=1:a=0[v]"
total = sum(s for _, s, _ in segments)
cmd = [
    "ffmpeg", "-y", *inputs,
    "-f", "lavfi", "-t", str(total), "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex", ";".join(filters) + ";" + concat,
    "-map", "[v]", "-map", f"{idx}:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-movflags", "+faststart", str(out),
]
subprocess.run(cmd, check=True, capture_output=True)
print(f"wrote {out} ({total:.1f}s, {len(segments)} segments)")


def ts(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


# Captions file with every line of on-screen text, for players that show closed captions.
cues, t = [], 0.0
for item, (_, secs, _) in zip(shots, segments):
    text = item.get("caption") or "\n".join(x for x in (item.get("title"), item.get("sub"), item.get("cta"), item.get("small")) if x)
    cues.append(f"{len(cues) + 1}\n{ts(t + 0.2)} --> {ts(t + secs - 0.2)}\n{text}\n")
    t += secs
out.with_suffix(".srt").write_text("\n".join(cues))

# The main version gets the soundtrack; the silent render is kept as the no-music version.
silent = out.with_name(out.stem + "-no-music.mp4")
out.replace(silent)
wav = src / "music.wav"
subprocess.run([sys.executable, str(Path(__file__).with_name("music.py")), str(total), str(wav)], check=True)
if VO:
    # Each line starts 0.4s into its segment. The music dips under the voice (sidechain ducking).
    starts, t = [], 0.0
    for _, secs, _ in segments:
        starts.append(t)
        t += secs
    vin, vf = [], []
    for k, (i, (f, _)) in enumerate(sorted(VO.items())):
        vin += ["-i", str(f)]
        ms = int((starts[i] + 0.4) * 1000)
        vf.append(f"[{k + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},volume=1.6[l{k}]")
    n = len(VO)
    graph = ";".join(vf) + ";" + "".join(f"[l{k}]" for k in range(n)) + f"amix=inputs={n}:normalize=0,apad[vo];"
    graph += "[vo]asplit[vo1][vo2];[1:a]aresample=48000,volume=0.8[mu];"
    graph += "[mu][vo1]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[duck];"
    graph += f"[duck][vo2]amix=inputs=2:normalize=0,atrim=0:{total},alimiter=limit=0.9[a]"
    audio = ["-i", str(wav), *vin, "-filter_complex", graph, "-map", "0:v", "-map", "[a]"]
else:
    audio = ["-i", str(wav), "-map", "0:v", "-map", "1:a"]
subprocess.run([
    "ffmpeg", "-v", "error", "-y", "-i", str(silent), *audio,
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out),
], check=True)
if VO:
    # No-music version keeps the voice-over.
    vo_only = ";".join(vf) + ";" + "".join(f"[l{k}]" for k in range(n)) + f"amix=inputs={n}:normalize=0,apad,atrim=0:{total}[a]"
    tmp = silent.with_name(silent.stem + "-tmp.mp4")
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(silent), "-i", str(wav), *vin, "-filter_complex", vo_only,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(tmp),
    ], check=True)
    tmp.replace(silent)
print(f"wrote {out}, {silent.name} and {out.with_suffix('.srt').name}")
