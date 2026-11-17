"""Soundtrack for the Google Ads film: the reel's 120 BPM groove, rearranged around an end card at 12.5 s.

    python soundtrack.py cues.json <assets/sounds> <out-dir>

The voices (marimba, plucks, drums, whoosh, chimes) and the sound-effect mixer come from
../reel/audio.py, so the reel and the ad sound like the same brand. Everything musical is
synthesised; the card sounds are the app's own (Kenney Casino Audio, CC0).
Output: music.wav and sfx.wav, 16 s, 48 kHz stereo 24-bit, 12 dB down (master them with ../reel/master.sh).
The film uses 0-15 s. The 6 s bumper uses 0-2.5 s and 12.5-16 s, which is why the end card plays on to 16 s.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "reel"))
import audio as kit  # noqa: E402  the reel's voices and sound-effect mixer

SR, BEAT, STEP = kit.SR, kit.BEAT, kit.STEP
DUR = 16.0
N = int(SR * DUR)
CTA = 12.5
place, freq = kit.place, kit.freq
CHORDS, ROOTS, FIFTHS = kit.CHORDS, kit.ROOTS, kit.FIFTHS
TIMELINE = [(0, 2, "C"), (2, 4, "G"), (4, 6, "Am"), (6, 8, "F"), (8, 10, "C"), (10, CTA, "G"), (CTA, DUR, "C")]


def chord_at(t: float) -> str:
    return next(name for start, end, name in TIMELINE if start <= t < end)


# The first six bars are the reel's melody over the same chords; a run climbs into the end card.
MELODY = [(bar * 2 + step * STEP, note) for bar in range(6) for step, note in kit.MELODY[bar]]
PICKUP = [(12.0, "G5"), (12.125, "A5"), (12.25, "B5"), (12.375, "D6")]
# The end card resolves at 14.5 s, before the film's last frame; the bumper hears one more arpeggio.
END = [(13.0, "G5"), (13.25, "C6"), (13.5, "E6"), (14.0, "D6"), (14.25, "E6"), (14.5, "C6"), (15.0, "G5"), (15.25, "C6"), (15.5, "E6")]


def build_music() -> np.ndarray:
    tones = np.zeros((2, N))
    keys = np.zeros((2, N))
    low = np.zeros((2, N))
    drums = np.zeros((2, N))

    for t, note in MELODY + PICKUP:
        place(tones, kit.marimba(freq(note)), t, 0.38, -0.12)
        place(tones, kit.pluck(freq(note) / 2, 0.55), t, 0.085, 0.22)
    for t, note in END:
        place(tones, kit.marimba(freq(note), 1.3), t, 0.44, -0.12)
        place(tones, kit.pluck(freq(note) / 2, 0.7), t, 0.085, 0.22)
    # The end card lands on the whole chord.
    for note in ("C5", "E5", "G5", "C6"):
        place(tones, kit.marimba(freq(note), 1.6), CTA, 0.2, 0.2)

    # Guitar-like arpeggio from four seconds to the end card.
    for bar in range(2, 7):
        for step, degree in kit.ARP:
            t = bar * 2 + step * STEP
            if t >= CTA:
                continue
            f = freq(CHORDS[chord_at(t)][degree]) * 2
            place(tones, kit.pluck(f, 0.4, 0.985), t, 0.075 + 0.03 * (bar >= 4), 0.42 if degree != 1 else -0.34)

    # Pads under everything; off-beat stabs up to the end card, then on its backbeats.
    for start, end, name in TIMELINE:
        chunk = kit.pad(CHORDS[name], end - start)
        begin = int(start * SR)
        keys[:, begin:begin + chunk.shape[1]] += chunk[:, :N - begin] * 0.034
    stabs = [i * BEAT / 2 for i in range(int(CTA / (BEAT / 2))) if i % 2 == 1] + [13.0, 14.0, 15.0]
    for t in stabs:
        for note in CHORDS[chord_at(t)]:
            place(keys, kit.epiano(freq(note) * 2 ** (-3 / 1200)), t, 0.1, -0.3)
            place(keys, kit.epiano(freq(note) * 2 ** (3 / 1200)), t, 0.1, 0.3)

    # Bass: the reel's line up to the end card, then one long root and a note under each kick.
    for bar in range(7):
        for step, kind in ((0, 0), (3, 0), (6, 2), (8, 0), (11, 1), (14, 0)):
            t = bar * 2 + step * STEP
            if t >= CTA:
                continue
            name = chord_at(t)
            root = freq(ROOTS[name])
            f = root * 2 if kind == 2 else freq(FIFTHS[name]) if kind == 1 else root
            place(low, kit.bass(f), t, 0.4)
    place(low, kit.bass(freq("C2"), 0.9), CTA, 0.5)
    for t in (13.5, 14.5, 15.5):
        place(low, kit.bass(freq("C2")), t, 0.34)

    # Drums: four on the floor up to the end card, then half time counted from its hit.
    kicks = [i * BEAT for i in range(int(CTA / BEAT))] + [CTA, 13.5, 14.5, 15.5]
    k = kit.kick()
    for t in kicks:
        place(drums, k, t, 0.56)
    c = kit.clap()
    for i in range(1, int(CTA / BEAT) - 1, 2):
        place(drums, c, i * BEAT, 0.62, 0.03)
    for i in range(8):
        place(drums, c, 12.0 + i * STEP / 2, 0.14 + 0.05 * i, (-1) ** i * 0.14)
    for t in (13.0, 14.0, 15.0):
        place(drums, c, t, 0.46, 0.02)
    for i in range(int(CTA / (BEAT / 2))):
        if i % 2 == 1:
            place(drums, kit.hat(38), i * BEAT / 2, 0.3, -0.18)
    for i in range(int(CTA / STEP)):
        place(drums, kit.shaker(), i * STEP, 0.09 + 0.05 * (i % 4 == 2), 0.2)
    place(drums, kit.riser(1.0), CTA - 1.0, 0.2, 0)
    place(drums, kit.impact(), CTA, 0.5)

    # The kick pushes everything melodic down a touch.
    ducking = np.ones(N)
    time = np.arange(N) / SR
    for t in kicks:
        begin = int(t * SR)
        ducking[begin:] = np.minimum(ducking[begin:], 1 - 0.36 * np.exp(-(time[begin:] - t) / 0.085))
    music = kit.reverb(tones * ducking, 1.25, 0.26) * 0.92 + kit.reverb(keys * ducking, 0.9, 0.2) + low * ducking + kit.reverb(drums, 0.6, 0.06)
    return np.stack([kit.spectral(side, lambda f: kit.highpass(f, 46, 3)) for side in music])


def main() -> None:
    cues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sounds, out = Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    kit.N, kit.DUR = N, DUR  # the reel's mixer sizes its bus from these
    music = build_music()
    sfx = kit.build_sfx(cues, sounds)
    tail = np.ones(N)
    tail[-int(0.12 * SR):] = np.linspace(1, 0, int(0.12 * SR))
    music, sfx = music * tail, sfx * tail
    print("peaks  music %.2f  sfx %.2f" % (np.abs(music).max(), np.abs(sfx).max()))
    kit.write_wav(out / "music.wav", music / 4)
    kit.write_wav(out / "sfx.wav", sfx / 4)


if __name__ == "__main__":
    main()
