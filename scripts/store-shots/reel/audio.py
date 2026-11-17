"""Soundtrack for the reel: an original 120 BPM groove plus the game's own card sounds.

    python audio.py cues.json <assets/sounds> <out-dir>

Everything musical is synthesised here, so there is nothing to license. The card and
chip sounds are the app's own (Kenney Casino Audio, CC0). Timings come from cues.json,
which reel.html writes next to the motion each sound belongs to.
Output: music.wav and sfx.wav, 48 kHz stereo 24-bit, stored 12 dB down so nothing clips before master.sh.
"""
from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
DUR = 15.0
N = int(SR * DUR)
BEAT = 0.5
STEP = BEAT / 4
rng = np.random.default_rng(1907)


def freq(name: str) -> float:
    notes = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((notes[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def place(bus: np.ndarray, sound: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix a mono sound into a stereo bus with equal-power panning."""
    start = int(round(t * SR))
    if start >= bus.shape[1]:
        return
    if start < 0:
        sound, start = sound[-start:], 0
    n = min(len(sound), bus.shape[1] - start)
    angle = (pan + 1) * np.pi / 4
    bus[0, start:start + n] += sound[:n] * gain * np.cos(angle)
    bus[1, start:start + n] += sound[:n] * gain * np.sin(angle)


def spectral(x: np.ndarray, shape) -> np.ndarray:
    spectrum = np.fft.rfft(x)
    spectrum *= shape(np.fft.rfftfreq(len(x), 1 / SR))
    return np.fft.irfft(spectrum, len(x))


def highpass(f, cut, order=2):
    ratio = np.maximum(f, 1e-6) / cut
    return ratio ** order / np.sqrt(1 + ratio ** (2 * order))


def lowpass(f, cut, order=2):
    return 1 / np.sqrt(1 + (np.maximum(f, 1e-6) / cut) ** (2 * order))


def env(t, speed, attack=0.003):
    return np.minimum(1, t / attack) * np.exp(-t * speed)


# ── Voices ────────────────────────────────────────────────────────────────
def marimba(f, seconds=0.9):
    """Same recipe as the app's own win and turn sounds, so music and game belong together."""
    t = np.arange(int(seconds * SR)) / SR
    tone = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5)
            + np.sin(2 * np.pi * f * 3.93 * t) * 0.32 * np.exp(-t * 22)
            + np.sin(2 * np.pi * f * 9.2 * t) * 0.08 * np.exp(-t * 45)
            + np.sin(2 * np.pi * f * 0.5 * t) * 0.12 * np.exp(-t * 9))
    return tone * np.minimum(1, t / 0.004)


def pluck(f, seconds=0.7, damp=0.992):
    """Karplus-Strong: a noise burst in a damped delay line. Computed one period at a time."""
    period = max(2, int(round(SR / f)))
    total = int(seconds * SR)
    out = np.zeros(total + period + 1)
    burst = rng.uniform(-1, 1, period)
    burst = np.convolve(burst, [0.25, 0.5, 0.25], mode="same")
    out[:period] = burst - burst.mean()
    for start in range(period, total + 1, period):
        block = out[start - period:start]
        previous = out[start - period - 1:start - 1] if start > period else np.concatenate(([0.0], block[:-1]))
        out[start:start + period] = damp * 0.5 * (block + previous)
    return out[:total] * np.minimum(1, np.arange(total) / (0.002 * SR))


def epiano(f, seconds=0.32, level=1.0):
    t = np.arange(int(seconds * SR)) / SR
    index = 1.5 * np.exp(-t * 10) + 0.2
    body = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    tine = np.sin(2 * np.pi * f * 14 * t) * 0.03 * np.exp(-t * 34)
    fade = np.minimum(1, (seconds - t) / 0.03)
    return (body * np.exp(-t * 6.5) + tine) * np.minimum(1, t / 0.003) * fade * level


def pad(notes, seconds):
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros((2, len(t)))
    for note in notes:
        f = freq(note)
        for side, cents in ((0, -5), (1, 5)):
            detuned = f * 2 ** (cents / 1200)
            out[side] += sum(np.sin(2 * np.pi * detuned * h * t + h) / h ** 1.6 for h in range(1, 6))
    shape = np.minimum(1, t / 0.07) * np.minimum(1, (seconds - t) / 0.07)
    return out * shape / len(notes)


def bass(f, seconds=0.26):
    t = np.arange(int(seconds * SR)) / SR
    tone = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    # Saturation keeps the line audible on phone speakers, which cannot play its fundamental.
    tone = np.tanh(tone * 1.5) / 1.1
    return tone * np.minimum(1, t / 0.004) * np.exp(-t * 7) * np.minimum(1, (seconds - t) / 0.02)


def kick():
    t = np.arange(int(0.34 * SR)) / SR
    pitch = 46 + 118 * np.exp(-t * 34)
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    click = spectral(rng.normal(0, 1, len(t)), lambda f: highpass(f, 2200)) * np.exp(-t * 320) * 0.32
    return (np.sin(phase) * np.exp(-t * 11) + click) * np.minimum(1, t / 0.001)


def clap():
    t = np.arange(int(0.26 * SR)) / SR
    noise = spectral(rng.normal(0, 1, len(t)), lambda f: highpass(f, 900) * lowpass(f, 7500))
    shape = sum(np.where(t >= d, np.exp(-(t - d) * 150), 0) for d in (0, 0.011, 0.023)) + np.where(t >= 0.034, np.exp(-(t - 0.034) * 24), 0) * 1.1
    return noise * shape / np.abs(noise).max()


def hat(speed=70):
    t = np.arange(int(0.12 * SR)) / SR
    noise = spectral(rng.normal(0, 1, len(t)), lambda f: highpass(f, 7200, 3))
    return noise * np.exp(-t * speed) / np.abs(noise).max()


def shaker():
    t = np.arange(int(0.07 * SR)) / SR
    noise = spectral(rng.normal(0, 1, len(t)), lambda f: highpass(f, 4800) * lowpass(f, 12000))
    return noise * np.minimum(1, t / 0.012) * np.exp(-t * 62) / np.abs(noise).max()


def whoosh(seconds=0.34, peak=0.21):
    """Noise through a filter whose cutoff rises to the cut and falls away after it."""
    total = int(seconds * SR)
    t = np.arange(total) / SR
    noise = rng.normal(0, 1, total)
    cut = 500 + 5200 * np.exp(-((t - peak) / 0.07) ** 2)
    coef = 1 - np.exp(-2 * np.pi * cut / SR)
    low = 0.0
    out = np.zeros(total)
    for i in range(total):
        low += coef[i] * (noise[i] - low)
        out[i] = low
    shape = np.exp(-((t - peak) / 0.1) ** 2)
    return out * shape / np.abs(out * shape).max()


def impact():
    t = np.arange(int(1.7 * SR)) / SR
    phase = 2 * np.pi * np.cumsum(38 + 82 * np.exp(-t * 16)) / SR
    boom = np.tanh(np.sin(phase) * 1.8) * np.exp(-t * 4.4)
    crash = spectral(rng.normal(0, 1, len(t)), lambda f: highpass(f, 3000) * lowpass(f, 15000)) * np.exp(-t * 3.4)
    return boom * 0.9 + crash / np.abs(crash).max() * 0.3


def riser(seconds=1.0):
    total = int(seconds * SR)
    t = np.arange(total) / SR
    noise = rng.normal(0, 1, total)
    u = t / seconds
    coef = 1 - np.exp(-2 * np.pi * (300 + 7000 * u ** 2.2) / SR)
    low = 0.0
    out = np.zeros(total)
    for i in range(total):
        low += coef[i] * (noise[i] - low)
        out[i] = low
    return out / np.abs(out).max() * u ** 2.1


def reverb(bus: np.ndarray, seconds=1.25, wet=0.2) -> np.ndarray:
    """Convolution with decaying, filtered stereo noise."""
    size = int(seconds * SR)
    t = np.arange(size) / SR
    out = np.zeros_like(bus)
    for side in range(2):
        ir = spectral(rng.normal(0, 1, size), lambda f: lowpass(f, 5200) * highpass(f, 220)) * np.exp(-t * 5.2)
        ir = np.concatenate((np.zeros(int(0.018 * SR)), ir))
        ir /= np.sqrt(np.sum(ir ** 2))
        length = bus.shape[1] + len(ir)
        out[side] = np.fft.irfft(np.fft.rfft(bus[side], length) * np.fft.rfft(ir, length), length)[:bus.shape[1]]
    return bus + out * wet


# ── The arrangement ───────────────────────────────────────────────────────
CHORDS = {"C": ["C4", "E4", "G4"], "G": ["B3", "D4", "G4"], "Am": ["C4", "E4", "A4"], "F": ["C4", "F4", "A4"]}
ROOTS = {"C": "C2", "G": "G2", "Am": "A2", "F": "F2"}
FIFTHS = {"C": "G2", "G": "D3", "Am": "E3", "F": "C3"}
TIMELINE = [(0, 2, "C"), (2, 4, "G"), (4, 6, "Am"), (6, 8, "F"), (8, 10, "C"), (10, 12, "G"), (12, 12.5, "F"), (12.5, 13, "G"), (13, 15, "C")]


def chord_at(t: float) -> str:
    return next(name for start, end, name in TIMELINE if start <= t < end)


# Sixteenth-note steps counted from the start of each two-second bar.
MELODY = {
    0: [(0, "E5"), (3, "G5"), (6, "A5"), (8, "G5"), (11, "E5"), (14, "D5")],
    1: [(0, "D5"), (3, "G5"), (6, "B5"), (8, "A5"), (11, "G5"), (14, "D5")],
    2: [(0, "C5"), (3, "E5"), (6, "A5"), (8, "G5"), (11, "E5"), (14, "C5")],
    3: [(0, "C5"), (3, "F5"), (6, "A5"), (8, "G5"), (11, "F5"), (14, "E5")],
    4: [(0, "E5"), (2, "G5"), (3, "A5"), (6, "C6"), (8, "A5"), (10, "G5"), (11, "E5"), (14, "D5")],
    5: [(0, "D5"), (2, "G5"), (3, "A5"), (6, "B5"), (8, "A5"), (10, "G5"), (11, "D5"), (14, "B4")],
    6: [(0, "A5"), (2, "G5"), (4, "B5"), (6, "D6"), (8, "C6"), (9, "E5"), (10, "G5"), (11, "C6"), (12, "E6"), (14, "C6")],
    7: [(0, "G5"), (2, "C6"), (4, "E6")],
}
ARP = [(0, 0), (2, 1), (3, 2), (5, 1), (6, 0), (8, 1), (10, 2), (11, 1), (13, 2), (14, 1)]


def build_music() -> np.ndarray:
    tones = np.zeros((2, N))
    keys = np.zeros((2, N))
    low = np.zeros((2, N))
    drums = np.zeros((2, N))

    # Melody with a quiet pluck an octave down for body.
    for bar, notes in MELODY.items():
        for step, note in notes:
            t = bar * 2 + step * STEP
            place(tones, marimba(freq(note)), t, 0.38 if t < 13 else 0.44, -0.12)
            place(tones, pluck(freq(note) / 2, 0.55), t, 0.085, 0.22)

    # Guitar-like arpeggio joins at four seconds and lifts the middle of the video.
    for bar in range(2, 7):
        for step, degree in ARP:
            t = bar * 2 + step * STEP
            if t >= 13:
                continue
            f = freq(CHORDS[chord_at(t)][degree]) * 2
            place(tones, pluck(f, 0.4, 0.985), t, 0.075 + 0.03 * (bar >= 4), 0.42 if degree != 1 else -0.34)

    # Off-beat stabs and a low pad carry the harmony.
    for start, end, name in TIMELINE:
        chunk = pad(CHORDS[name], end - start)
        begin = int(start * SR)
        keys[:, begin:begin + chunk.shape[1]] += chunk[:, :N - begin] * 0.034
    for i in range(int(DUR / (BEAT / 2))):
        t = i * BEAT / 2
        if i % 2 == 1 and t < 13:
            for note in CHORDS[chord_at(t)]:
                place(keys, epiano(freq(note) * 2 ** (-3 / 1200)), t, 0.1, -0.3)
                place(keys, epiano(freq(note) * 2 ** (3 / 1200)), t, 0.1, 0.3)

    # Bass
    for bar in range(7):
        for step, kind in ((0, 0), (3, 0), (6, 2), (8, 0), (11, 1), (14, 0)):
            t = bar * 2 + step * STEP
            if t >= 13:
                continue
            name = chord_at(t)
            root = freq(ROOTS[name])
            f = root * 2 if kind == 2 else freq(FIFTHS[name]) if kind == 1 else root
            place(low, bass(f), t, 0.4)

    # Drums: four on the floor up to the end card, then half time.
    kicks = [i * BEAT for i in range(26)] + [13.0, 14.0]
    k = kick()
    for t in kicks:
        place(drums, k, t, 0.56)
    c = clap()
    for i in range(1, 25, 2):
        place(drums, c, i * BEAT, 0.62, 0.03)
    # Fill into the end card.
    for i in range(8):
        place(drums, c, 12.5 + i * STEP / 2, 0.14 + 0.05 * i, (-1) ** i * 0.14)
    for i in range(int(13 / (BEAT / 2))):
        t = i * BEAT / 2
        if i % 2 == 1:
            place(drums, hat(38), t, 0.3, -0.18)
    for i in range(int(13 / STEP)):
        place(drums, shaker(), i * STEP, 0.09 + 0.05 * (i % 4 == 2), 0.2)
    for t in (13.5, 14.5):
        place(drums, c, t, 0.46, 0.02)
    place(drums, riser(1.0), 12.0, 0.2, 0)
    place(drums, impact(), 13.0, 0.5)

    # The kick pushes everything melodic down a touch: the pulse a groove needs.
    ducking = np.ones(N)
    time = np.arange(N) / SR
    for t in kicks:
        begin = int(t * SR)
        ducking[begin:] = np.minimum(ducking[begin:], 1 - 0.36 * np.exp(-(time[begin:] - t) / 0.085))
    music = reverb(tones * ducking, 1.25, 0.26) * 0.92 + reverb(keys * ducking, 0.9, 0.2) + low * ducking + reverb(drums, 0.6, 0.06)
    phone = lambda bus: 20 * np.log10(np.sqrt(np.mean(spectral(bus.mean(axis=0), lambda f: highpass(f, 220, 3)) ** 2)) + 1e-9)
    print("phone-band RMS dB  melody+plucks %.1f  keys %.1f  bass %.1f  drums %.1f" % (phone(tones), phone(keys), phone(low), phone(drums)))
    music = np.stack([spectral(side, lambda f: highpass(f, 46, 3)) for side in music])
    return music


# ── Sound effects ─────────────────────────────────────────────────────────
def load(path: Path) -> np.ndarray:
    with wave.open(str(path)) as source:
        rate, width, channels, frames = source.getframerate(), source.getsampwidth(), source.getnchannels(), source.getnframes()
        raw = source.readframes(frames)
    data = np.frombuffer(raw, {1: np.uint8, 2: np.int16}[width]).astype(np.float64)
    data = (data - 128) / 128 if width == 1 else data / 32768
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    if rate != SR:
        data = np.interp(np.arange(int(len(data) * SR / rate)) * rate / SR, np.arange(len(data)), data)
    return data / max(1e-6, np.abs(data).max())


def shifted(sound: np.ndarray, semitones: float) -> np.ndarray:
    ratio = 2 ** (semitones / 12)
    return np.interp(np.arange(0, len(sound) - 1, ratio), np.arange(len(sound)), sound)


# The win and turn jingles are moved to fit the chord under them.
PITCH = {"win": 7, "turn": 1}
# A cue names a moment on screen. The audible hit of these recordings sits as much as
# 0.34 s into the file, so they are placed by their loudest point, not their first sample.
HIT_ALIGNED = ("card-place", "card-draw", "meld-2", "coins")
ALIASES = {"riffle": "meld-1"}


def chime(notes: str) -> np.ndarray:
    """Two quick rising marimba notes from the chord under the moment a group completes."""
    low, high = (freq(note) for note in notes.split(","))
    out = np.zeros(int(0.95 * SR))
    out[:int(0.9 * SR)] += marimba(low)
    start = int(0.07 * SR)
    out[start:start + int(0.88 * SR)] += marimba(high, 0.88) * 1.1
    return out / np.abs(out).max()


def build_sfx(cues: list[dict], sounds: Path) -> np.ndarray:
    bus = np.zeros((2, N))
    cache: dict[str, np.ndarray] = {}
    swish = whoosh()
    for cue in sorted(cues, key=lambda c: c["t"]):
        name = cue["s"]
        if name == "whoosh":
            # The cue marks the cut; the whoosh crests there and pans with the light sweep.
            place(bus, swish, cue["t"] - 0.18, 0.2 * cue["g"], -0.35)
            place(bus, swish[::-1], cue["t"] - 0.08, 0.14 * cue["g"], 0.4)
            continue
        if name.startswith("chime:"):
            place(bus, chime(name.split(":")[1]), cue["t"], 0.74 * cue["g"], 0)
            continue
        if name not in cache:
            sound = load(sounds / f"{ALIASES.get(name, name)}.wav")
            cache[name] = shifted(sound, PITCH[name]) if name in PITCH else sound
        sound = cache[name]
        lead = int(np.argmax(np.abs(sound))) / SR if name.startswith(HIT_ALIGNED) else 0.0
        place(bus, sound, cue["t"] - lead, 0.74 * cue["g"], cue.get("pan", 0))
    return bus


def write_wav(path: Path, bus: np.ndarray) -> None:
    pcm = np.clip(bus.T, -1, 1)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(3)
        out.setframerate(SR)
        scaled = (pcm * 8388607).astype(np.int32)
        out.writeframes(np.frombuffer(scaled.astype("<i4").tobytes(), dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes())


def main() -> None:
    cues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sounds, out = Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    music = build_music()
    sfx = build_sfx(cues, sounds)
    # A short release instead of an abrupt stop at the last sample.
    tail = np.ones(N)
    tail[-int(0.12 * SR):] = np.linspace(1, 0, int(0.12 * SR))
    music, sfx = music * tail, sfx * tail
    print("peaks  music %.2f  sfx %.2f" % (np.abs(music).max(), np.abs(sfx).max()))
    write_wav(out / "music.wav", music / 4)
    write_wav(out / "sfx.wav", sfx / 4)


if __name__ == "__main__":
    main()
