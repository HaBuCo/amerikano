"""Soundtrack for "Herkes ekti mi?": an original Turkish-pop groove at 120 BPM.

    python soundtrack.py cues.json <assets/sounds> <out-dir>

Darbuka in maqsum (doum-tek-tek-doum-tek), snaps and claps, a saz-like plucked lead in D hicaz
(D Eb F# G A Bb C), bass and brass stabs; the end card lands on an Eb -> D cadence at 17 s.
Everything musical is synthesised here; the card sounds are the app's own (Kenney Casino Audio, CC0).
A few generic voices (Karplus-Strong pluck, kick, clap, pad, reverb, riser, impact) come from ../reel/audio.py.
Output: music.wav and sfx.wav, 20 s, 48 kHz stereo 24-bit, 12 dB down (master them with ../reel/master.sh).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "reel"))
import audio as kit  # noqa: E402  generic voices only; the arrangement below is new

SR = kit.SR
DUR = 20.0
N = int(SR * DUR)
BEAT = 0.5
STEP = BEAT / 4
DROP, SLAM, WIN, CTA = 4.0, 2.75, 12.5, 17.0
place, spectral, highpass, lowpass = kit.place, kit.spectral, kit.highpass, kit.lowpass
rng = np.random.default_rng(2026)


FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}


def sharp(note: str) -> str:
    return FLATS.get(note[:-1], note[:-1]) + note[-1]


def f(note: str) -> float:
    """Note names with flats as well as sharps: Eb4, Bb3, F#5."""
    return kit.freq(sharp(note))


# ── Voices ────────────────────────────────────────────────────────────────
def doum():
    """The darbuka's deep centre stroke: a pitched membrane falling from 150 to 82 Hz."""
    t = np.arange(int(0.5 * SR)) / SR
    pitch = 82 + 68 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-t * 7.5)
    thump = spectral(rng.normal(0, 1, len(t)), lambda x: lowpass(x, 900)) * np.exp(-t * 60) * 0.25
    return np.tanh((body + thump) * 1.6) / 1.2 * np.minimum(1, t / 0.002)


def tek(soft=False):
    """The rim stroke: a bright crack with two short metallic rings; `soft` is the other hand's ka."""
    t = np.arange(int(0.22 * SR)) / SR
    lo, hi = (640, 1290) if soft else (820, 1660)
    crack = spectral(rng.normal(0, 1, len(t)), lambda x: highpass(x, 1800) * lowpass(x, 9000)) * np.exp(-t * (95 if soft else 70))
    ring = (np.sin(2 * np.pi * lo * t) * 0.5 + np.sin(2 * np.pi * hi * t) * 0.35) * np.exp(-t * (48 if soft else 34))
    out = crack / np.abs(crack).max() * 0.8 + ring
    return out / np.abs(out).max() * (0.55 if soft else 1.0) * np.minimum(1, t / 0.0008)


def snap():
    t = np.arange(int(0.12 * SR)) / SR
    noise = spectral(rng.normal(0, 1, len(t)), lambda x: highpass(x, 1500) * lowpass(x, 5200))
    tone = np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) * 0.4
    return (noise / np.abs(noise).max() * np.exp(-t * 85) + tone) * np.minimum(1, t / 0.0005)


def saz(freq, seconds=0.6):
    """A bağlama-like course: two plucked strings an octave apart, a pick click, a little buzz."""
    main = kit.pluck(freq, seconds, 0.9965)
    octave = kit.pluck(freq * 2 * 2 ** (4 / 1200), seconds, 0.994) * 0.42
    t = np.arange(len(main)) / SR
    pick = spectral(rng.normal(0, 1, len(t)), lambda x: highpass(x, 2500)) * np.exp(-t * 400) * 0.05
    out = np.tanh((main + octave) * 1.8) / 1.4 + pick
    return out * np.minimum(1, (seconds - t) / 0.03)


def brass(notes, seconds=0.32, level=1.0):
    """A synth-brass stab: detuned saw-like tones through a filter that opens and closes."""
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros(len(t))
    for note in notes:
        for cents in (-7, 7):
            fr = f(note) * 2 ** (cents / 1200)
            out += sum(np.sin(2 * np.pi * fr * h * t) / h for h in range(1, 9))
    cutoff = 700 + 3200 * np.exp(-t * 14)
    shaped = np.zeros(len(t))
    # A one-pole low-pass whose cutoff follows the envelope, in short blocks.
    block = 256
    state = 0.0
    for start in range(0, len(t), block):
        coef = 1 - np.exp(-2 * np.pi * cutoff[start] / SR)
        for i in range(start, min(start + block, len(t))):
            state += coef * (out[i] - state)
            shaped[i] = state
    env = np.minimum(1, t / 0.012) * np.exp(-t * 4) * np.minimum(1, (seconds - t) / 0.04)
    return shaped * env / max(1e-9, np.abs(shaped).max()) * level


def sub(freq, seconds=0.45):
    t = np.arange(int(seconds * SR)) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.15 * np.sin(6 * np.pi * freq * t)
    return np.tanh(tone * 1.4) / 1.1 * np.minimum(1, t / 0.005) * np.exp(-t * 3.2) * np.minimum(1, (seconds - t) / 0.03)


def pop():
    """A chat message landing: a quick rising bubble."""
    t = np.arange(int(0.09 * SR)) / SR
    pitch = 520 + 900 * (t / 0.09) ** 0.6
    return np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-t * 38) * np.minimum(1, t / 0.002)


# ── The arrangement ───────────────────────────────────────────────────────
CHORDS = {"D": ["D4", "F#4", "A4"], "Gm": ["G3", "Bb3", "D4"], "Cm": ["C4", "Eb4", "G4"], "Eb": ["Eb4", "G4", "Bb4"]}
ROOT = {"D": "D2", "Gm": "G1", "Cm": "C2", "Eb": "Eb2"}
# Two-second bars: the intro and slam, the drop, the game, the win, the games and the end card.
TIMELINE = [(0, 4, "D"), (4, 8, "D"), (8, 10, "Gm"), (10, 11, "Cm"), (11, 12.5, "D"), (12.5, 16.5, "D"), (16.5, 17, "Eb"), (17, 20, "D")]


def chord_at(t: float) -> str:
    return next(name for start, end, name in TIMELINE if start <= t < end)


# The lead, as (sixteenth within its bar, note, length in sixteenths), bar by bar from the drop.
A = [(0, "D5", 2), (2, "D5", 1), (3, "Eb5", 1), (4, "D5", 2), (6, "C5", 2), (8, "Bb4", 2), (10, "A4", 2), (12, "Bb4", 1), (13, "A4", 1), (14, "G4", 2)]
A2 = [(0, "F#4", 2), (2, "G4", 1), (3, "F#4", 1), (4, "Eb4", 2), (6, "D4", 4), (12, "A4", 1), (13, "Bb4", 1), (14, "C5", 2)]
B = A[:8] + [(12, "A4", 1), (13, "Bb4", 1), (14, "C5", 1), (15, "D5", 1)]
B2 = [(0, "Eb5", 2), (2, "D5", 2), (4, "C5", 2), (6, "Bb4", 1), (7, "A4", 1), (8, "G4", 2), (10, "F#4", 2), (12, "Eb4", 2), (14, "D4", 2)]
RUN = [(0, "D5", 4), (8, "D5", 1), (9, "C5", 1), (10, "Bb4", 1), (11, "A4", 1), (12, "G4", 1), (13, "F#4", 1), (14, "Eb4", 1), (15, "D4", 1)]
LEAD = {4: A, 6: A2, 8: B, 10: B2, 12.5: RUN, 14.5: A, 16.5: [(0, "A4", 1), (1, "Bb4", 1), (2, "A4", 1), (3, "G4", 1), (4, "F#4", 1), (5, "Eb4", 1), (6, "D4", 2)]}
FINAL = [(17.5, "A4"), (17.75, "Bb4"), (18.0, "A4"), (18.25, "G4"), (18.5, "F#4"), (18.75, "Eb4"), (19.0, "D4")]

# Maqsum in sixteenths: doum on 1 and 3, tek on the "and" of 1, on the "and" of 2 and on 4; ka fills between.
MAQSUM = [(0, "D"), (2, "T"), (6, "T"), (8, "D"), (12, "T")]
FILLS = [(3, "K"), (5, "K"), (10, "K"), (14, "K"), (15, "K")]


def bars(start, end):
    t = start
    while t < end - 1e-9:
        yield t
        t += 4 * BEAT


def build_music() -> np.ndarray:
    lead = np.zeros((2, N))
    keys = np.zeros((2, N))
    low = np.zeros((2, N))
    perc = np.zeros((2, N))
    D, T_, K = doum(), tek(), tek(soft=True)
    sn, cl, kk = snap(), kit.clap(), kit.kick()
    kicks = []

    # Darbuka the whole way, quieter under the chat, fuller after the drop, out under the slam.
    for bar in bars(0, 16.5):
        full = bar >= DROP
        for step, stroke in MAQSUM:
            t = bar + step * STEP
            if SLAM - .05 <= t < DROP:
                continue
            g = (0.75 if full else 0.5)
            if stroke == "D":
                place(perc, D, t, 0.9 * g, -0.05)
            else:
                place(perc, T_, t, 0.55 * g, 0.18)
        for step, _ in FILLS:
            t = bar + step * STEP
            if (SLAM - .05 <= t < DROP) or (not full and step in (5, 15)):
                continue
            place(perc, K, t, 0.36 if full else 0.24, -0.22)
    # A roll that climbs into the drop.
    for i in range(16):
        t = 3.0 + i * STEP / 2
        place(perc, T_ if i % 2 else K, t, 0.12 + 0.03 * i, (-1) ** i * 0.2)
    # Before the drop: snaps on 2 and 4. After it: kick on 1 and 3, claps on 2 and 4.
    for bar in bars(0, SLAM):
        for beat in (1, 3):
            place(perc, sn, bar + beat * BEAT, 0.42, 0.25)
    for bar in bars(DROP, 16.5):
        for beat in (0, 2):
            kicks.append(bar + beat * BEAT)
        for beat in (1, 3):
            place(perc, cl, bar + beat * BEAT, 0.5, 0.04)
    # The win: a fill, then the hit lands with the trophy.
    for i in range(6):
        place(perc, T_, WIN - 0.5 + i * STEP / 1.5, 0.18 + 0.05 * i, (-1) ** i * 0.2)
    kicks += [SLAM, SLAM + 0.25, DROP, WIN, CTA, 18.0, 19.0]
    for t in sorted(set(kicks)):
        place(perc, kk, t, 0.6)

    # Lead: the saz plays the hook from the drop, the run at the win and the cadence into the end card.
    for start, phrase in LEAD.items():
        for step, note, length in phrase:
            t = start + step * STEP
            place(lead, saz(f(note), max(0.25, length * STEP + 0.25)), t, 0.36, -0.15)
    for t, note in FINAL:
        place(lead, saz(f(note), 0.9 if note != "D4" else 1.6), t, 0.36, -0.15)
    # In the hook, under the chat, the saz only answers each message with two notes.
    for t, notes in ((0.5, ("A4", "G4")), (1.15, ("Bb4", "A4")), (2.2, ("F#4", "Eb4"))):
        for i, note in enumerate(notes):
            place(lead, saz(f(note), 0.5), t + 0.12 + i * STEP, 0.22, -0.2)

    # Pads, bass and brass.
    for start, end, name in TIMELINE:
        chunk = kit.pad([sharp(n) for n in CHORDS[name]], end - start)
        begin = int(start * SR)
        keys[:, begin:begin + chunk.shape[1]] += chunk[:, :N - begin] * (0.02 if start < DROP else 0.03)
    for bar in bars(0, 16.5):
        for step in (0, 8):
            t = bar + step * STEP
            if SLAM - .05 <= t < DROP:
                continue
            place(low, sub(f(ROOT[chord_at(t)]), 0.42), t, 0.42 if t >= DROP else 0.3)
        if bar >= DROP:
            for step in (3, 11, 14):
                t = bar + step * STEP
                place(low, sub(f(ROOT[chord_at(t)]) * (2 if step == 14 else 1), 0.18), t, 0.24)
    for t, name in ((SLAM, "D"), (SLAM + 0.25, "Eb")):
        place(keys, brass(CHORDS[name] + [CHORDS[name][0][:-1] + "5"], 0.3), t, 0.3, 0)
        place(low, sub(f(ROOT[name]), 0.3), t, 0.4)
    for t in [b for b in bars(DROP, 16.5)] + [WIN]:
        place(keys, brass(CHORDS[chord_at(t)], 0.26), t, 0.2, 0.1)
    for bar in bars(DROP, 16.5):
        for step in (6, 14):
            place(keys, brass(CHORDS[chord_at(bar + step * STEP)], 0.14, 0.7), bar + step * STEP, 0.12, -0.1)
    place(keys, brass(CHORDS["Eb"] + ["Eb5"], 0.45), 16.5, 0.24, 0)
    place(keys, brass(["D4", "F#4", "A4", "D5"], 1.6), CTA, 0.3, 0)
    place(low, sub(f("D2"), 1.8), CTA, 0.55)
    place(low, sub(f("D2"), 0.6), 18.0, 0.32)
    place(low, sub(f("D2"), 1.0), 19.0, 0.32)
    for t, g in ((18.0, 0.12), (19.0, 0.1)):
        place(keys, brass(["D4", "F#4", "A4"], 0.5, 0.8), t, g, 0)

    # Risers and hits.
    place(perc, kit.riser(1.0), DROP - 1.0, 0.24, 0)
    place(perc, kit.riser(0.9), WIN - 0.9, 0.18, 0)
    place(perc, kit.riser(1.0), CTA - 1.0, 0.2, 0)
    for t, g in ((SLAM, 0.42), (SLAM + 0.25, 0.32), (DROP, 0.5), (WIN, 0.45), (CTA, 0.55)):
        place(perc, kit.impact(), t, g)

    ducking = np.ones(N)
    time = np.arange(N) / SR
    for t in kicks:
        begin = int(t * SR)
        ducking[begin:] = np.minimum(ducking[begin:], 1 - 0.32 * np.exp(-(time[begin:] - t) / 0.09))
    music = (kit.reverb(lead * ducking, 1.1, 0.22) + kit.reverb(keys * ducking, 1.0, 0.2) + low * ducking + kit.reverb(perc, 0.5, 0.07))
    phone = lambda bus: 20 * np.log10(np.sqrt(np.mean(spectral(bus.mean(axis=0), lambda x: highpass(x, 220, 3)) ** 2)) + 1e-9)
    print("phone-band RMS dB  lead %.1f  keys %.1f  bass %.1f  percussion %.1f" % (phone(lead), phone(keys), phone(low), phone(perc)))
    return np.stack([spectral(side, lambda x: highpass(x, 40, 3)) for side in music])


# ── Sound effects ─────────────────────────────────────────────────────────
def build_sfx(cues: list[dict], sounds: Path) -> np.ndarray:
    """The reel's mixer, plus the two sounds this film adds: chat pops and slam hits."""
    kit.N, kit.DUR = N, DUR
    bus = kit.build_sfx([c for c in cues if c["s"] not in ("pop", "impact")], sounds)
    bubble, hit = pop(), kit.impact()
    for c in cues:
        if c["s"] == "pop":
            place(bus, bubble, c["t"], 0.5 * c["g"], c.get("pan", 0))
        elif c["s"] == "impact":
            place(bus, hit, c["t"], 0.28 * c["g"], 0)
    return bus


def main() -> None:
    cues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sounds, out = Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    music = build_music()
    sfx = build_sfx(cues, sounds)
    tail = np.ones(N)
    tail[-int(0.4 * SR):] = np.linspace(1, 0, int(0.4 * SR))
    music, sfx = music * tail, sfx * tail
    print("peaks  music %.2f  sfx %.2f" % (np.abs(music).max(), np.abs(sfx).max()))
    kit.write_wav(out / "music.wav", music / 4)
    kit.write_wav(out / "sfx.wav", sfx / 4)


if __name__ == "__main__":
    main()
