import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const out = fileURLToPath(new URL("../assets/audio/", import.meta.url));
await mkdir(out, { recursive: true });
function wav(seconds, sample) {
  const rate = 32000,
    length = Math.floor(seconds * rate),
    b = Buffer.alloc(44 + length * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const edge = Math.min(1, t / 0.06, (seconds - t) / 0.06);
    const v = Math.max(-0.8, Math.min(0.8, sample(t) * Math.max(0, edge)));
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return b;
}
const duration = 16;
const themes = {
  earth: [130.8128, 196, 261.6256],
  rivers: [146.8324, 220, 293.6648, 349.2282],
  workshop: [164.8138, 246.9417, 329.6276],
  tomorrow: [174.6141, 261.6256, 349.2282, 440],
};
for (const [name, notes] of Object.entries(themes))
  await writeFile(
    path.join(out, `${name}.wav`),
    wav(
      duration,
      (t) =>
        notes.reduce(
          (v, hz, i) =>
            v +
            Math.sin(
              ((2 * Math.PI * Math.round(hz * duration)) / duration) * t,
            ) *
              (1 / (i + 1)) *
              0.045,
          0,
        ) *
        (0.8 + 0.18 * Math.sin((2 * Math.PI * t) / duration)),
    ),
  );
await writeFile(
  path.join(out, "discovery.wav"),
  wav(
    0.32,
    (t) =>
      (Math.sin(2 * Math.PI * 660 * t) +
        Math.sin(2 * Math.PI * 880 * t) * 0.45) *
      Math.exp(-12 * t) *
      0.18,
  ),
);
console.log(
  "Áudio original: quatro pads16s PCMmono32kHz e descoberta0,32s. Sem gravações ou conteúdo de terceiros.",
);
