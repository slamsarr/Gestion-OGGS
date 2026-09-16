import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC = join(ROOT, "public");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function inRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const r = radius;
  if (x >= r && x < size - r) return true;
  if (y >= r && y < size - r) return true;
  const corners = [
    [r, r],
    [size - 1 - r, r],
    [r, size - 1 - r],
    [size - 1 - r, size - 1 - r],
  ];
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
}

function colorAt(x, y, size) {
  const r = (12 * size) / 64;
  if (!inRoundedRect(x, y, size, r)) return [0, 0, 0, 0];
  const s = size / 64;
  const bar = (bx, by, bw, bh) => {
    const left = bx * s;
    const top = by * s;
    const w = bw * s;
    const h = bh * s;
    const rad = 2 * s;
    const lx = x - left;
    const ly = y - top;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
    if (lx >= rad && lx < w - rad) return true;
    if (ly >= rad && ly < h - rad) return true;
    const corners = [
      [rad, rad],
      [w - 1 - rad, rad],
      [rad, h - 1 - rad],
      [w - 1 - rad, h - 1 - rad],
    ];
    return corners.some(([cx, cy]) => (lx - cx) ** 2 + (ly - cy) ** 2 <= rad * rad);
  };
  if (bar(14, 18, 10, 28)) return [242, 185, 12, 255];
  if (bar(28, 26, 10, 20)) return [243, 246, 248, 255];
  if (bar(42, 22, 10, 24)) return [29, 143, 91, 255];
  return [14, 58, 86, 255];
}

export function makePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = colorAt(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function generatePwaIcons(dir = PUBLIC) {
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const size of [192, 512]) {
    const file = join(dir, `icon-${size}.png`);
    writeFileSync(file, makePng(size));
    written.push(file);
  }
  const apple = join(dir, "apple-touch-icon.png");
  writeFileSync(apple, makePng(180));
  written.push(apple);
  return written;
}
