// gta6-meme-x-01 entry program (Node 22, standard library only, no network).
//
// What it does:
//   1. Reads entry.png from beside this file and checks it is a whole PNG:
//      the 8-byte PNG signature, an IEND trailer as the final chunk, and a
//      size of at most 1 MiB. It also reads the IHDR width and height and
//      requires them to be sane (positive, at most 10000 pixels each).
//   2. Reads POST.json from beside this file, parses it, and requires its
//      url to be a non-empty https://x.com/<handle>/status/<digits> URL.
//   3. Writes both files into the output directory and prints their byte
//      counts, so the gate can read the post address and the meme image.
//
// Usage (outside the grader's container, from the entry directory):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIR = process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MAX_PNG_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readSource(name: string): Buffer {
  try {
    return readFileSync(join(SOURCE_DIR, name));
  } catch (err) {
    fail(`could not read ${name} from ${SOURCE_DIR}: ${(err as Error).message}`);
  }
}

function pngDimensions(png: Buffer): { width: number; height: number } {
  // The IHDR chunk follows the 8-byte signature: 4-byte length, "IHDR",
  // then 4-byte width and 4-byte height, both big-endian.
  if (png.length < 8 + 4 + 4 + 8) {
    fail('entry.png is too short to hold an IHDR chunk');
  }
  if (png.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail('entry.png has no IHDR chunk where one is expected');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  return { width, height };
}

function validatePng(png: Buffer): void {
  if (png.length === 0) {
    fail('entry.png is empty');
  }
  if (png.length > MAX_PNG_BYTES) {
    fail(`entry.png is ${png.length} bytes, over the 1 MiB limit`);
  }
  if (png.length < PNG_SIGNATURE.length || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail('entry.png does not start with the PNG signature');
  }
  if (png.length < PNG_IEND.length || !png.subarray(png.length - PNG_IEND.length).equals(PNG_IEND)) {
    fail('entry.png does not end with an IEND chunk (truncated file?)');
  }
  const { width, height } = pngDimensions(png);
  if (width === 0 || height === 0 || width > 10000 || height > 10000) {
    fail(`entry.png has implausible dimensions ${width}x${height}`);
  }
  if (png.readUInt32BE(8) !== 13) {
    fail('entry.png IHDR chunk length is not 13 bytes');
  }
  // Walk the chunk list and require at least one IDAT chunk, so a file that
  // is only a header plus IEND is not mistaken for a real image.
  let offset = 8;
  let sawIdat = false;
  while (offset + 8 <= png.length - PNG_IEND.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') {
      sawIdat = true;
    }
    offset += 12 + length;
  }
  if (!sawIdat) {
    fail('entry.png has no IDAT chunk (no image data)');
  }
  console.log(`entry.png: ${png.length} bytes, ${width}x${height}`);
}

function validatePost(raw: Buffer): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    fail(`POST.json is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('POST.json must be a JSON object');
  }
  const url = (parsed as { url?: unknown }).url;
  if (typeof url !== 'string' || url.length === 0) {
    fail('POST.json url must be a non-empty string');
  }
  const match = /^https:\/\/x\.com\/([A-Za-z0-9_]+)\/status\/([0-9]+)$/.exec(url);
  if (!match) {
    fail(`POST.json url is not an https://x.com/<handle>/status/<digits> URL: ${url}`);
  }
  console.log(`POST.json: @${match[1]} status ${match[2]}`);
  return url;
}

const png = readSource('entry.png');
validatePng(png);

const postRaw = readSource('POST.json');
validatePost(postRaw);

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'entry.png'), png);
writeFileSync(join(OUTPUT_DIR, 'POST.json'), postRaw);
console.log(`wrote entry.png (${png.length} bytes) and POST.json (${postRaw.length} bytes) to ${OUTPUT_DIR}`);
