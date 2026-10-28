// Synthesises the game's notification sounds (turn, error, win…). The card and
// chip sounds are real recordings: see scripts/import-card-sounds.mjs.
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
const attack = (t, seconds = 0.004) => Math.min(1, t / seconds);

/**
 * A small room: four damped comb filters into two all-passes (Schroeder).
 * `wet` is how much of the room is heard; short sounds stay dry and clear.
 */
function reverb(values, wet) {
  if (!wet) return values;
  const combs = [1116, 1188, 1277, 1356].map(length => ({ buffer: new Float32Array(length), index: 0, low: 0 }));
  const passes = [556, 441].map(length => ({ buffer: new Float32Array(length), index: 0 }));
  return values.map(dry => {
    let room = 0;
    for (const comb of combs) {
      const out = comb.buffer[comb.index];
      comb.low = out * 0.6 + comb.low * 0.4;
      comb.buffer[comb.index] = dry + comb.low * 0.78;
      comb.index = (comb.index + 1) % comb.buffer.length;
      room += out;
    }
    room /= combs.length;
    for (const pass of passes) {
      const delayed = pass.buffer[pass.index];
      const input = room + delayed * 0.5;
      pass.buffer[pass.index] = input;
      pass.index = (pass.index + 1) % pass.buffer.length;
      room = delayed - input * 0.5;
    }
    return dry * (1 - wet * 0.5) + room * wet;
  });
}

function writeSound(name, seconds, sample, { level = 28000, wet = 0 } = {}) {
  const length = Math.floor(rate * seconds);
  const values = reverb(Array.from({ length }, (_, index) => sample(index / rate)), wet);
  // A short fade keeps the reverb tail from ending in a click.
  const fade = Math.min(length, Math.floor(rate * 0.03));
  for (let index = 0; index < fade; index += 1) values[length - 1 - index] *= index / fade;
  const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0.01);
  const pcm = Buffer.alloc(length * 2);
  values.forEach((value, index) => pcm.writeInt16LE(Math.round(value / peak * level), index * 2));
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  writeFileSync(new URL(`${name}.wav`, output), wav);
}

// A marimba bar: a warm fundamental with the bar's high partials dying fast.
const marimba = (frequency, t) => attack(t) * (
  tone(frequency, t) * decay(t, 5.5)
  + tone(frequency * 3.93, t) * 0.32 * decay(t, 22)
  + tone(frequency * 9.2, t) * 0.08 * decay(t, 45)
  + tone(frequency * 0.5, t) * 0.12 * decay(t, 9));
// A small bell: inharmonic partials with a long, shimmering tail.
const bell = (frequency, t) => attack(t, 0.002) * (
  tone(frequency, t) * decay(t, 3.2)
  + tone(frequency * 2.76, t) * 0.4 * decay(t, 6)
  + tone(frequency * 5.4, t) * 0.18 * decay(t, 11)
  + tone(frequency * 8.93, t) * 0.07 * decay(t, 18));
const play = (notes, voice, gain = 1) => (t) => notes.reduce((sum, [start, frequency, volume = 1]) => {
  const local = t - start;
  return local < 0 ? sum : sum + voice(frequency, local) * volume * gain;
}, 0);

// UI tap: a soft felt-and-wood click, quieter than any card sound.
writeSound('tap', 0.08, (t) => (noise() * 0.5 * decay(t, 90) + tone(1650, t) * 0.35 * decay(t, 70)) * attack(t, 0.001), { level: 17000 });

// Joker: a quick rising sparkle of bells.
writeSound('joker', 0.9, play([[0, 1319], [0.06, 1568], [0.12, 1976], [0.19, 2637], [0.27, 3136, 0.7]], bell, 0.5), { wet: 0.32 });

// Deal won: a bright marimba arpeggio, C major up to the octave.
writeSound('win', 1.25, play([[0, 523], [0.09, 659], [0.18, 784], [0.29, 1047, 1.2], [0.29, 784, 0.4]], marimba), { wet: 0.28 });

// Your turn: two clear notes that rise, easy to notice from across the room.
writeSound('turn', 1.0, play([[0, 659], [0.13, 988, 1.1], [0.13, 1319, 0.25]], marimba), { level: 30000, wet: 0.25 });

// Error: a short, muted low double knock rather than a buzzer.
writeSound('error', 0.36, play([[0, 220], [0.11, 196]], (frequency, t) => marimba(frequency, t) * decay(t, 7)), { level: 24000, wet: 0.1 });

// Clock tick for the last seconds: a dry wood block.
writeSound('tick', 0.07, (t) => (tone(1320, t) * decay(t, 85) + tone(2640, t) * 0.25 * decay(t, 120) + noise() * 0.1 * decay(t, 140)) * attack(t, 0.0008), { level: 22000 });

// Penalty: three falling notes, firm but not harsh.
writeSound('penalty', 0.8, play([[0, 494], [0.12, 415], [0.24, 330, 1.1]], marimba), { wet: 0.22 });

// Deal lost: a gentle, warm descent in a minor key.
writeSound('lose', 1.4, play([[0, 392], [0.17, 311], [0.34, 262], [0.55, 196, 1.2], [0.55, 294, 0.35]], marimba, 0.9), { wet: 0.35 });

// A brass-like voice: a stack of harmonics with a soft attack and a little vibrato.
const brass = (frequency, t) => {
  const vibrato = 1 + Math.sin(Math.PI * 2 * 5.5 * t) * 0.004 * Math.min(1, t * 3);
  return [1, 0.62, 0.46, 0.32, 0.21, 0.13].reduce((sum, gain, index) =>
    sum + tone(frequency * (index + 1) * vibrato, t) * gain, 0) * Math.min(1, t * 38);
};
// Soft clipping keeps the peaks in range while the fanfare sounds fuller and louder.
const saturate = (value, drive = 1.7) => Math.tanh(value * drive) / Math.tanh(drive);

// Match won: drum pickup, a brass fanfare into a held C major chord, bells on top.
writeSound('victory', 2.9, (t) => {
  let value = 0;
  for (const start of [0, 0.15, 0.3, 0.75]) {
    const local = t - start;
    if (local >= 0) value += (tone(62 - local * 40, local) * 1.3 + noise() * 0.35 * decay(local, 40)) * decay(local, start === 0.75 ? 7 : 14);
  }
  for (const [start, frequency, length] of [[0, 392, 0.14], [0.15, 523, 0.14], [0.3, 659, 0.14], [0.45, 784, 0.26]]) {
    const local = t - start;
    if (local >= 0 && local < length + 0.08) value += brass(frequency, local) * 0.42 * Math.min(1, (length + 0.08 - local) * 12);
  }
  const chord = t - 0.75;
  if (chord >= 0) {
    const swell = Math.min(1, chord * 6) * decay(Math.max(0, chord - 0.5), 1.25);
    value += [523, 659, 784, 1047].reduce((sum, frequency) => sum + brass(frequency, chord), 0) * 0.3 * swell;
  }
  if (chord >= 0) value += noise() * 0.22 * decay(chord, 2.4);
  for (const [start, frequency] of [[0.95, 1568], [1.07, 1976], [1.19, 2349], [1.31, 3136], [1.5, 2349], [1.62, 3136]]) {
    const local = t - start;
    if (local >= 0) value += (tone(frequency, local) + tone(frequency * 2.76, local) * 0.18) * 0.22 * decay(local, 7);
  }
  return saturate(value);
}, { level: 32000, wet: 0.18 });

console.log('Generated 9 synthesised game sounds in assets/sounds.');
