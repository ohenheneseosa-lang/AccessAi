"""Writes a light, optimistic instrumental bed for the promo. Made from scratch, so it is
royalty-free and needs no licence.

Usage: python3 music.py <seconds> <out.wav>
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 92
BEAT = 60 / BPM
seconds = float(sys.argv[1])
out = sys.argv[2]
n = int(SR * (seconds + 1))
mix = np.zeros((n, 2))


def note_freq(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= n:
        return
    sig = sig[: n - i] * gain
    mix[i : i + len(sig), 0] += sig * (1 - pan) / 2 * 2 ** 0.5
    mix[i : i + len(sig), 1] += sig * (1 + pan) / 2 * 2 ** 0.5


def pluck(midi, dur):
    """Soft electric-piano-like note: a few harmonics with a gentle decay."""
    t = np.arange(int(SR * dur)) / SR
    f = note_freq(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    env = np.exp(-t * 3.2) * np.minimum(1, t * 200)
    return tone * env


def pad(midis, dur):
    """Warm sustained chord: slightly detuned sines with a slow swell."""
    t = np.arange(int(SR * dur)) / SR
    sig = np.zeros_like(t)
    for m in midis:
        f = note_freq(m)
        for det in (-0.12, 0.0, 0.12):
            sig += np.sin(2 * np.pi * f * (1 + det / 100) * t + det)
    env = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.0)
    return sig * env / (len(midis) * 3)


def bass(midi, dur):
    t = np.arange(int(SR * dur)) / SR
    f = note_freq(midi)
    return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 1.5) * np.minimum(1, t * 100)


def shaker(dur=0.06):
    t = np.arange(int(SR * dur)) / SR
    noise = np.random.default_rng(len(t)).standard_normal(len(t))
    hp = np.diff(noise, prepend=0)  # crude high-pass so it stays light
    return hp * np.exp(-t * 60)


def kick():
    t = np.arange(int(SR * 0.25)) / SR
    f = 110 * np.exp(-t * 18) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)


# I - V - vi - IV in D major, one chord per bar of 4 beats.
CHORDS = [
    (50, [62, 66, 69, 74]),  # D
    (45, [61, 64, 69, 73]),  # A
    (47, [62, 66, 71, 74]),  # Bm
    (43, [62, 67, 71, 74]),  # G
]
ARP = [0, 1, 2, 3, 2, 1, 2, 3]  # eighth-note pattern through the chord tones
bar = 4 * BEAT
bars = int(seconds / bar) + 1
for b in range(bars):
    t0 = b * bar
    root, tones = CHORDS[b % 4]
    add(pad([m - 12 for m in tones[:3]], bar + 0.8), t0, gain=0.22)
    add(bass(root, bar), t0, gain=0.28)
    # Arpeggio comes in after the first two bars and drops out for the last bar.
    if 2 <= b < bars - 1:
        for k, idx in enumerate(ARP):
            add(pluck(tones[idx] + 12, 0.9), t0 + k * BEAT / 2, pan=0.35 if k % 2 else -0.35, gain=0.13)
    if 4 <= b < bars - 1:
        for k in range(4):
            add(kick(), t0 + k * BEAT, gain=0.22 if k % 2 == 0 else 0.0)
            add(shaker(), t0 + k * BEAT + BEAT / 2, pan=0.4, gain=0.05)

# Fade in and out, then normalise to a gentle level.
t = np.arange(n) / SR
mix *= np.minimum(1, t / 2.0)[:, None] * np.clip((seconds - t) / 3.0, 0, 1)[:, None]
mix = mix[: int(SR * seconds)]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.5
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f"wrote {out} ({seconds:.1f}s)")
