import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { assertDistributionPath, crc32, encodeGrayscalePng, encodeRgbPng, inspectPng } from '../scripts/optimize-illustrations.mjs';

test('gray8 PNG encoding keeps every decoded RGBA pixel and validates all chunk CRCs', async () => {
  const width = 97, height = 63, rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, gray = (x * 11 + y * 7 + (x % 9 ? 0 : 50)) % 256;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = gray; rgba[i + 3] = 255;
  }
  const png = encodeGrayscalePng(rgba, width, height), header = inspectPng(png);
  assert.equal(header.colorType, 0); assert.equal(header.depth, 8);
  const image = await loadImage(png), canvas = createCanvas(width, height), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  assert.deepEqual(ctx.getImageData(0, 0, width, height).data, new Uint8ClampedArray(rgba));
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
  const bad = Buffer.from(png); bad[20] ^= 1; assert.throws(() => inspectPng(bad), /CRC/);
  assert.throws(() => inspectPng(png.subarray(0, -2)), /incompleto/);
});

test('grayscale encoding rejects even one coloured or translucent pixel', () => {
  assert.throws(() => encodeGrayscalePng(new Uint8Array([240, 241, 240, 255]), 1, 1), /r=g=b/);
  assert.throws(() => encodeGrayscalePng(new Uint8Array([240, 240, 240, 254]), 1, 1), /alfa255/);
  assert.throws(() => encodeGrayscalePng(new Uint8Array(4), 10, 10), /Dimensões/);
});

test('RGB8 fallback preserves every colour channel instead of converting nearly-gray art', async () => {
  const rgba = new Uint8Array([250, 251, 250, 255, 0, 0, 0, 255, 30, 90, 180, 255, 255, 255, 255, 255]);
  const png = encodeRgbPng(rgba, 2, 2); assert.equal(inspectPng(png).colorType, 2);
  const image = await loadImage(png), canvas = createCanvas(2, 2), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  assert.deepEqual(ctx.getImageData(0, 0, 2, 2).data, new Uint8ClampedArray(rgba));
});

test('distribution output is restricted before any mutation, including source directories', async () => {
  await assert.rejects(() => assertDistributionPath('assets/illustrations'), /Masters/);
  await assert.rejects(() => assertDistributionPath('../outside'), /Destino/);
  await assert.rejects(() => assertDistributionPath('build/../../outside'), /Destino/);
  assert.match(await assertDistributionPath('build/web/illustrations'), /build[\\/]web[\\/]illustrations$/);
  assert.match(await assertDistributionPath('apps/mobile/assets/illustrations'), /apps[\\/]mobile[\\/]assets[\\/]illustrations$/);
});
