import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function inMark(nx, ny) {
  if (ny < 0.28 || ny > 0.72 || nx < 0.36 || nx > 0.8) return false;
  const left = nx >= 0.36 && nx <= 0.44;
  const right = nx >= 0.72 && nx <= 0.8;
  const t = Math.min(1, Math.max(0, (ny - 0.28) / 0.22));
  const leftDiag = t <= 1 && Math.abs(nx - (0.44 + t * 0.14)) < 0.035;
  const rightDiag = t <= 1 && Math.abs(nx - (0.72 - t * 0.14)) < 0.035;
  return left || right || (ny < 0.52 && (leftDiag || rightDiag));
}

function png(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const radius = size * 0.22;
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      const offset = y * stride + 1 + x * 4;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const outside = dx < radius && dy < radius && (radius - dx) ** 2 + (radius - dy) ** 2 > radius ** 2;
      let red = 28;
      let green = 25;
      let blue = 21;
      let alpha = outside ? 0 : 255;
      if (!outside && nx > 0.16 && nx < 0.25 && ny > 0.18 && ny < 0.82) {
        red = 142;
        green = 47;
        blue = 42;
      } else if (!outside && inMark(nx, ny)) {
        red = 251;
        green = 248;
        blue = 242;
      }
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL("../public/icon-192.png", import.meta.url), png(192));
writeFileSync(new URL("../public/icon-512.png", import.meta.url), png(512));
console.log("icons written");
