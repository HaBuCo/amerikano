"""Masters soundtrack.py's stems: python master.py <audio-dir>

Card sounds sit 8 dB above the music (as in the reel), then the mix is measured and brought to
-14 LUFS with a limiter keeping peaks near -1.5 dBFS, the level YouTube and Google Ads normalise to.
Writes <audio-dir>/master-music.wav.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

TARGET = -14.0


def loudness(path: Path) -> tuple[float, float]:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    integrated = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])
    peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", out)[-1])
    return integrated, peak


def main() -> None:
    folder = Path(sys.argv[1])
    mix = folder / "mix.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(folder / "music.wav"), "-i", str(folder / "sfx.wav"), "-filter_complex",
                    "[0:a]volume=4dB[m];[1:a]volume=12dB[s];[m][s]amix=inputs=2:normalize=0[o]", "-map", "[o]", "-c:a", "pcm_s24le", str(mix)], check=True)
    integrated, _ = loudness(mix)
    master = folder / "master-music.wav"
    gain = TARGET - integrated
    # The limiter takes a little loudness off the top; one correction pass brings it back.
    for _ in range(2):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mix), "-af",
                        f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=1.5:release=40:level=disabled,volume=-0.6dB",
                        "-c:a", "pcm_s24le", str(master)], check=True)
        result, peak = loudness(master)
        gain += TARGET - result
    print(f"master-music: {result:.1f} LUFS, true peak {peak:.1f} dBFS")


if __name__ == "__main__":
    main()
