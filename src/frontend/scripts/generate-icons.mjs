/**
 * PWA 图标生成脚本（零依赖，纯 Node.js）
 *
 * 生成内容（输出到 src/frontend/public/）：
 *   - icon-192.png          192x192 通用图标
 *   - icon-512.png          512x512 通用图标
 *   - apple-touch-icon.png  180x180 iOS 主屏图标
 *   - favicon.ico           32x32（内嵌 PNG 的 ICO，现代浏览器均支持）
 *
 * 图标设计：#3B82F6 主题色背景 + 白色同心波纹（呼应 Rippling 涟漪意象），
 * 中心实心圆点 + 两道渐远圆环，边缘做平滑抗锯齿。
 *
 * 运行方式：node src/frontend/scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/** 主题色 #3B82F6 */
const BG = [0x3b, 0x82, 0xf6];
/** 波纹白色 */
const FG = [255, 255, 255];

// ============================================================
//  PNG 编码（最小实现：IHDR + IDAT + IEND，RGBA 8bit）
// ============================================================

/** CRC32 查表法（PNG chunk 校验） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 组装一个 PNG chunk：长度 + 类型 + 数据 + CRC */
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA 像素数组 → PNG Buffer */
function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type = RGBA
  // 压缩 / 滤波 / 隔行扫描均为 0

  // 每行前加 filter byte 0（无滤波）
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ============================================================
//  图标绘制：蓝底 + 白色同心波纹（含抗锯齿）
// ============================================================

/**
 * 绘制 size x size 图标
 *
 * 波纹结构（半径按尺寸比例）：
 *   - 中心实心圆  r = 0.11
 *   - 第一道圆环  r = 0.27，环宽 0.07
 *   - 第二道圆环  r = 0.43，环宽 0.07
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const aa = Math.max(1, size / 192); // 抗锯齿过渡宽度（像素）

  /** 平滑过渡系数：edge 内 0→1 */
  function smooth(dist, edge) {
    const t = Math.min(Math.max(dist / edge, 0), 1);
    return t * t * (3 - 2 * t); // smoothstep
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const d = Math.sqrt(dx * dx + dy * dy) / size;

      // 前景覆盖度（0 = 纯背景，1 = 纯白）
      let cover = 0;

      // 中心实心圆
      cover = Math.max(cover, 1 - smooth(d - 0.11, aa / size));
      // 两道圆环：|d - r| < 环宽/2 区域
      for (const r of [0.27, 0.43]) {
        const ringDist = Math.abs(d - r) - 0.035;
        cover = Math.max(cover, 1 - smooth(ringDist, aa / size));
      }

      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(BG[c] * (1 - cover) + FG[c] * cover);
      }
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, rgba);
}

/** PNG Buffer → 内嵌 PNG 的 ICO Buffer（32x32） */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 保留
  header.writeUInt16LE(1, 2); // 类型 = ICO
  header.writeUInt16LE(1, 4); // 图片数量

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // 宽（0 表示 256）
  entry[1] = size >= 256 ? 0 : size; // 高
  entry[2] = 0; // 调色板
  entry[3] = 0; // 保留
  entry.writeUInt16LE(1, 4); // 色平面
  entry.writeUInt16LE(32, 6); // 位深
  entry.writeUInt32LE(png.length, 8); // 数据长度
  entry.writeUInt32LE(22, 12); // 数据偏移（6 + 16）

  return Buffer.concat([header, entry, png]);
}

// ============================================================
//  生成输出
// ============================================================

mkdirSync(PUBLIC_DIR, { recursive: true });

const outputs = [
  ["icon-192.png", drawIcon(192)],
  ["icon-512.png", drawIcon(512)],
  ["apple-touch-icon.png", drawIcon(180)],
  ["favicon.ico", pngToIco(drawIcon(32), 32)],
];

for (const [name, data] of outputs) {
  const path = join(PUBLIC_DIR, name);
  writeFileSync(path, data);
  console.log(`生成 ${name}（${data.length} 字节）`);
}

console.log("图标生成完毕 →", PUBLIC_DIR);
