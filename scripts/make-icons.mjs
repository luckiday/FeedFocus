// Produce icons/icon{16,32,48,128}.png.
//
// If you drop a square master at icons/icon.png (≥512px, generated however you
// like), this resizes it with macOS `sips`. Otherwise it writes on-brand
// placeholders so the extension still loads. Run via `npm run icons`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
mkdirSync("icons", { recursive: true });

const SIZES = [16, 32, 48, 128];
const master = "icons/icon.png";

if (existsSync(master)) {
  for (const s of SIZES) {
    execFileSync("cp", [master, `icons/icon${s}.png`]);
    execFileSync("sips", ["-z", String(s), String(s), `icons/icon${s}.png`], {
      stdio: "ignore",
    });
  }
  console.log(`✓ Resized ${master} → icon${SIZES.join(", icon")}.png`);
} else {
  for (const s of SIZES) writeFileSync(`icons/icon${s}.png`, placeholder(s));
  console.log(
    "✓ Wrote brand placeholder icons (no icons/icon.png master found).\n" +
      "  Drop your generated master at icons/icon.png and re-run `npm run icons`."
  );
}

// --- on-brand placeholder: dark rounded tile + G/Y/R dots ---
function placeholder(size) {
  const bg = [28, 25, 23, 255]; // #1c1917
  const dots = [
    [125, 143, 124, 255], // G #7d8f7c
    [184, 154, 78, 255], // Y #b89a4e
    [143, 77, 69, 255], // R #8f4d45
  ];
  const px = new Uint8Array(size * size * 4);
  const cr = size * 0.22; // corner radius
  const dr = Math.max(1, size * 0.1); // dot radius
  const cy = size * 0.5;
  const gap = size * 0.26;
  const cxs = [size * 0.5 - gap, size * 0.5, size * 0.5 + gap];

  const outsideCorner = (x, y) => {
    const near = (cx, cyy) => (x - cx) ** 2 + (y - cyy) ** 2 > cr * cr;
    if (x < cr && y < cr) return near(cr, cr);
    if (x > size - cr && y < cr) return near(size - cr, cr);
    if (x < cr && y > size - cr) return near(cr, size - cr);
    if (x > size - cr && y > size - cr) return near(size - cr, size - cr);
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let c = outsideCorner(x + 0.5, y + 0.5) ? [0, 0, 0, 0] : bg;
      for (let d = 0; d < 3; d++) {
        if ((x + 0.5 - cxs[d]) ** 2 + (y + 0.5 - cy) ** 2 <= dr * dr) c = dots[d];
      }
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = c[3];
    }
  }
  return encodePng(size, size, px);
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
