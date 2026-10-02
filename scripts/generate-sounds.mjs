import { mkdirSync, writeFileSync } from 'node:fs';

const rate = 44100;
const output = new URL('../assets/sounds/', import.meta.url);
mkdirSync(output, { recursive: true });
let seed = 0x41a3c59d;
const noise = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0xffffffff * 2 - 1;
};
const decay = (t, speed) => Math.exp(-t * speed);
const tone = (frequency, t, phase = 0) => Math.sin(Math.PI * 2 * frequency * t + phase);

function writeSound(name, seconds, sample) {
  const length = Math.floor(rate * seconds);
  const values = Array.from({ length }, (_, index) => sample(index / rate));
  const peak = Math.max(0.01, ...values.map(Math.abs));
  const pcm = Buffer.alloc(length * 2);
  values.forEach((value, index) => pcm.writeInt16LE(Math.round(value / peak * 28000), index * 2));
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  writeFileSync(new URL(`${name}.wav`, output), wav);
}

writeSound('tap', 0.07, (t) => (noise() * 0.65 + tone(760, t) * 0.2) * decay(t, 65));

writeSound('card-draw', 0.16, (t) => {
  const sweep = tone(1350 - t * 4300, t) * 0.16;
  return (noise() * (0.55 - t * 1.8) + sweep) * Math.sin(Math.min(1, t * 90) * Math.PI / 2) * decay(t, 15);
});

writeSound('card-place', 0.18, (t) => {
  const slap = noise() * decay(t, 42);
  const wood = tone(145, t) * decay(t, 23);
  return slap * 0.72 + wood * 0.35;
});

writeSound('meld', 0.42, (t) => {
  const notes = [[0, 392], [0.09, 494], [0.18, 587]];
  return notes.reduce((sum, [start, frequency]) => {
    const local = t - start;
    return local < 0 ? sum : sum + (tone(frequency, local) + tone(frequency * 2.01, local) * 0.22) * decay(local, 11);
  }, 0);
});

writeSound('joker', 0.56, (t) => {
  const notes = [[0, 660], [0.07, 880], [0.14, 1108], [0.22, 1320]];
  return notes.reduce((sum, [start, frequency]) => {
    const local = t - start;
    return local < 0 ? sum : sum + tone(frequency, local) * decay(local, 9) + tone(frequency * 2, local) * decay(local, 16) * 0.18;
  }, 0);
});

writeSound('shuffle', 0.48, (t) => {
  const burst = [0, 0.085, 0.17, 0.255, 0.34].reduce((sum, start) => {
    const local = t - start;
    return local >= 0 && local < 0.11 ? sum + noise() * Math.sin(local / 0.11 * Math.PI) : sum;
  }, 0);
  return burst * 0.72;
});

writeSound('win', 1.05, (t) => {
  const notes = [[0, 392], [0.12, 494], [0.24, 587], [0.38, 784]];
  return notes.reduce((sum, [start, frequency]) => {
    const local = t - start;
    return local < 0 ? sum : sum + (tone(frequency, local) + tone(frequency * 1.5, local) * 0.24) * decay(local, 3.8);
  }, 0);
});

writeSound('turn', 0.9, (t) => {
  const notes = [[0, 659], [0.16, 880], [0.4, 659], [0.56, 880]];
  return notes.reduce((sum, [start, frequency]) => {
    const local = t - start;
    return local < 0 ? sum : sum + (tone(frequency, local) + tone(frequency * 2, local) * 0.3) * Math.min(1, local * 200) * decay(local, 6);
  }, 0);
});

const notesSound = (notes, speed, harmonic = 2, harmonicGain = 0.25) => (t) => notes.reduce((sum, [start, frequency]) => {
  const local = t - start;
  return local < 0 ? sum : sum + (tone(frequency, local) + tone(frequency * harmonic, local) * harmonicGain) * Math.min(1, local * 300) * decay(local, speed);
}, 0);

writeSound('error', 0.3, notesSound([[0, 220], [0.1, 165]], 11, 3, 0.45));

writeSound('tick', 0.06, (t) => (tone(1180, t) + tone(2360, t) * 0.3 + noise() * 0.08) * decay(t, 80));

writeSound('penalty', 0.7, notesSound([[0, 330], [0.14, 277], [0.28, 233]], 6, 3, 0.4));

writeSound('lose', 1.15, notesSound([[0, 392], [0.18, 349], [0.36, 311], [0.56, 262]], 4.2, 1.5, 0.2));

writeSound('deal', 0.55, (t) => [0, 0.1, 0.2, 0.3, 0.4].reduce((sum, start) => {
  const local = t - start;
  return local < 0 ? sum : sum + (noise() * 0.7 + tone(1500 - local * 5000, local) * 0.15) * decay(local, 45);
}, 0));

console.log('Generated 13 original game sounds in assets/sounds.');
