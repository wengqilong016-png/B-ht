const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function color(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: alpha,
  };
}

function createCanvas(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = fill.r;
    data[o + 1] = fill.g;
    data[o + 2] = fill.b;
    data[o + 3] = fill.a;
  }
  return { width, height, data };
}

function setPixel(canvas, x, y, fill) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const o = (y * canvas.width + x) * 4;
  canvas.data[o] = fill.r;
  canvas.data[o + 1] = fill.g;
  canvas.data[o + 2] = fill.b;
  canvas.data[o + 3] = fill.a;
}

function fillRect(canvas, x, y, w, h, fill) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvas.width, Math.ceil(x + w));
  const y1 = Math.min(canvas.height, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) setPixel(canvas, xx, yy, fill);
  }
}

function fillCircle(canvas, cx, cy, r, fill) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(canvas.width, Math.ceil(cx + r));
  const y1 = Math.min(canvas.height, Math.ceil(cy + r));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(canvas, xx, yy, fill);
    }
  }
}

function fillRoundedRect(canvas, x, y, w, h, r, fill) {
  fillRect(canvas, x + r, y, w - 2 * r, h, fill);
  fillRect(canvas, x, y + r, r, h - 2 * r, fill);
  fillRect(canvas, x + w - r, y + r, r, h - 2 * r, fill);
  fillCircle(canvas, x + r, y + r, r, fill);
  fillCircle(canvas, x + w - r, y + r, r, fill);
  fillCircle(canvas, x + r, y + h - r, r, fill);
  fillCircle(canvas, x + w - r, y + h - r, r, fill);
}

function fillTriangle(canvas, x1, y1, x2, y2, x3, y3, fill) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(y1, y2, y3)));
  const area = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / area;
      const w2 = ((x3 - x2) * (y - y2) - (y3 - y2) * (x - x2)) / area;
      const w3 = ((x1 - x3) * (y - y3) - (y1 - y3) * (x - x3)) / area;
      if (w1 >= 0 && w2 >= 0 && w3 >= 0) setPixel(canvas, x, y, fill);
    }
  }
}

function drawBahatiIcon(size) {
  const navy = color('#102C57');
  const navySoft = color('#1B3E73');
  const amber = color('#F3B63A');
  const ivory = color('#F8FAFC');
  const slate = color('#15314F');
  const canvas = createCanvas(size, size, navy);

  fillRoundedRect(canvas, size * 0.08, size * 0.08, size * 0.84, size * 0.84, size * 0.2, navySoft);
  fillCircle(canvas, size * 0.72, size * 0.27, size * 0.12, amber);
  fillCircle(canvas, size * 0.72, size * 0.27, size * 0.055, navy);

  fillRoundedRect(canvas, size * 0.22, size * 0.2, size * 0.4, size * 0.54, size * 0.08, ivory);
  fillRoundedRect(canvas, size * 0.28, size * 0.28, size * 0.24, size * 0.12, size * 0.04, slate);
  fillRoundedRect(canvas, size * 0.29, size * 0.45, size * 0.22, size * 0.16, size * 0.04, amber);
  fillCircle(canvas, size * 0.4, size * 0.53, size * 0.035, ivory);

  fillCircle(canvas, size * 0.34, size * 0.78, size * 0.08, amber);
  fillTriangle(
    canvas,
    size * 0.34, size * 0.93,
    size * 0.28, size * 0.81,
    size * 0.40, size * 0.81,
    amber,
  );
  fillCircle(canvas, size * 0.34, size * 0.78, size * 0.036, navy);
  fillCircle(canvas, size * 0.34, size * 0.78, size * 0.018, ivory);

  return canvas;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, canvas) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = canvas.width * 4;
  const raw = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    canvas.data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function writeSvg(filePath) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#102C57"/>
  <rect x="42" y="42" width="428" height="428" rx="96" fill="#1B3E73"/>
  <circle cx="370" cy="138" r="62" fill="#F3B63A"/>
  <circle cx="370" cy="138" r="28" fill="#102C57"/>
  <rect x="113" y="102" width="205" height="277" rx="42" fill="#F8FAFC"/>
  <rect x="144" y="143" width="123" height="62" rx="20" fill="#15314F"/>
  <rect x="149" y="229" width="113" height="82" rx="20" fill="#F3B63A"/>
  <circle cx="205" cy="270" r="18" fill="#F8FAFC"/>
  <circle cx="174" cy="402" r="41" fill="#F3B63A"/>
  <path d="M174 474L143 418H205L174 474Z" fill="#F3B63A"/>
  <circle cx="174" cy="402" r="18" fill="#102C57"/>
  <circle cx="174" cy="402" r="9" fill="#F8FAFC"/>
</svg>`;
  fs.writeFileSync(filePath, svg);
}

ensureDir(ICONS_DIR);
writeSvg(path.join(ICONS_DIR, 'icon.svg'));
writePng(path.join(ICONS_DIR, 'icon-192.png'), drawBahatiIcon(192));
writePng(path.join(ICONS_DIR, 'icon-512.png'), drawBahatiIcon(512));

console.log('Generated Bahati icon set in public/icons');
