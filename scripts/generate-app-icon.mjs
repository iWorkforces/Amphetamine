/**
 * Generate app icons for Amphetamine.
 *
 * Creates a coffee cup icon with a colored background at all required
 * resolutions, then packages into .icns (macOS, via iconutil) and .ico (Windows).
 *
 * Usage:
 *   bun scripts/generate-app-icon.mjs
 *
 * Output:
 *   build/icon.icns   (macOS only when iconutil is available)
 *   build/icon.ico    (Windows; always generated)
 *   src/assets/settings-hero-icon.png
 */

import sharp from "sharp";
import { Buffer } from "node:buffer";
import process from "node:process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, "..", "build");
const ASSETS_DIR = join(__dirname, "..", "src", "assets");
const ICONSET_DIR = join(BUILD_DIR, "AppIcon.iconset");
const OUTPUT_ICNS = join(BUILD_DIR, "icon.icns");
const OUTPUT_ICO = join(BUILD_DIR, "icon.ico");
const SETTINGS_HERO_ICON = join(ASSETS_DIR, "settings-hero-icon.png");

/** Windows ICO sizes (square PNG-in-ICO entries). */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// iconutil requires these exact filenames
const ICON_SIZES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

/**
 * App icon SVG — coffee cup on rounded-rect gradient background.
 * Inspired by macOS app icon design conventions.
 */
function appIconSvg(size) {
  const s = size;
  const r = s * 0.225; // corner radius (macOS squircle-like)

  // Coffee cup proportions (scaled to icon size)
  const pad = s * 0.18;
  const iw = s - pad * 2;
  const ih = s - pad * 2;

  const cupW = iw * 0.55;
  const cupH = ih * 0.45;
  const cupX = iw * 0.14;
  const cupY = ih * 0.42;

  const handleW = iw * 0.16;
  const handleH = cupH * 0.55;
  const handleX = cupX + cupW;
  const handleY = cupY + (cupH - handleH) / 2;

  const saucerW = iw * 0.74;
  const saucerH = ih * 0.065;
  const saucerX = (iw - saucerW) / 2;
  const saucerY = cupY + cupH + ih * 0.03;

  const steamTopY = ih * 0.14;
  const steamBotY = cupY - ih * 0.06;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A2C2A"/>
      <stop offset="100%" style="stop-color:#2C1810"/>
    </linearGradient>
    <linearGradient id="cup" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#FFFFFF"/>
      <stop offset="100%" style="stop-color:#E8E0D8"/>
    </linearGradient>
    <linearGradient id="saucer" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#F5F0EB"/>
      <stop offset="100%" style="stop-color:#D9CFC5"/>
    </linearGradient>
  </defs>

  <!-- Background rounded rectangle -->
  <rect width="${s}" height="${s}" rx="${r}" ry="${r}" fill="url(#bg)"/>

  <g transform="translate(${pad}, ${pad})">
    <!-- Steam lines -->
    <path d="M ${iw * 0.34} ${steamTopY} Q ${iw * 0.3} ${(steamTopY + steamBotY) / 2} ${iw * 0.34} ${steamBotY}"
          fill="none" stroke="#FFFFFF" stroke-width="${s * 0.05}" stroke-linecap="round" opacity="0.5"/>
    <path d="M ${iw * 0.5} ${steamTopY - ih * 0.03} Q ${iw * 0.46} ${(steamTopY + steamBotY) / 2 - ih * 0.015} ${iw * 0.5} ${steamBotY - ih * 0.015}"
          fill="none" stroke="#FFFFFF" stroke-width="${s * 0.05}" stroke-linecap="round" opacity="0.35"/>
    <path d="M ${iw * 0.66} ${steamTopY + ih * 0.01} Q ${iw * 0.62} ${(steamTopY + steamBotY) / 2 + ih * 0.008} ${iw * 0.66} ${steamBotY - ih * 0.008}"
          fill="none" stroke="#FFFFFF" stroke-width="${s * 0.04}" stroke-linecap="round" opacity="0.22"/>

    <!-- Saucer -->
    <rect x="${saucerX}" y="${saucerY}" width="${saucerW}" height="${saucerH}" rx="${saucerH / 2}" fill="url(#saucer)"/>

    <!-- Cup body -->
    <path d="M ${cupX} ${cupY}
             Q ${cupX} ${cupY + cupH} ${cupX + cupW * 0.08} ${cupY + cupH}
             L ${cupX + cupW - cupW * 0.08} ${cupY + cupH}
             Q ${cupX + cupW} ${cupY + cupH} ${cupX + cupW} ${cupY}
             Z"
          fill="url(#cup)"/>

    <!-- Handle -->
    <path d="M ${handleX} ${handleY}
             Q ${handleX + handleW} ${handleY} ${handleX + handleW} ${handleY + handleH * 0.15}
             Q ${handleX + handleW} ${handleY + handleH} ${handleX} ${handleY + handleH}"
          fill="none" stroke="#E8E0D8" stroke-width="${s * 0.055}" stroke-linecap="round"/>
  </g>
</svg>`;
}

const log = (...msg) => process.stdout.write(msg.join(" ") + "\n");

/**
 * Build a multi-resolution .ico from PNG buffers (PNG-compressed ICO entries).
 * @param {{ width: number; height: number; data: Buffer }[]} images
 */
function buildIcoFromPngs(images) {
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const totalSize = headerSize + images.reduce((sum, img) => sum + img.data.length, 0);
  const buf = Buffer.alloc(totalSize);

  // ICONDIR
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = icon
  buf.writeUInt16LE(count, 4);

  let entryOffset = 6;
  for (const img of images) {
    const w = img.width >= 256 ? 0 : img.width;
    const h = img.height >= 256 ? 0 : img.height;
    buf.writeUInt8(w, entryOffset);
    buf.writeUInt8(h, entryOffset + 1);
    buf.writeUInt8(0, entryOffset + 2); // color palette
    buf.writeUInt8(0, entryOffset + 3); // reserved
    buf.writeUInt16LE(1, entryOffset + 4); // color planes
    buf.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    buf.writeUInt32LE(img.data.length, entryOffset + 8);
    buf.writeUInt32LE(offset, entryOffset + 12);
    img.data.copy(buf, offset);
    offset += img.data.length;
    entryOffset += 16;
  }
  return buf;
}

// --- Main ---

log("Generating app icons...\n");
mkdirSync(BUILD_DIR, { recursive: true });

// Create iconset directory for macOS
if (ICONSET_DIR) rmSync(ICONSET_DIR, { recursive: true, force: true });
mkdirSync(ICONSET_DIR, { recursive: true });

// Generate all PNG sizes for .icns
for (const { name, size } of ICON_SIZES) {
  const svg = appIconSvg(size);
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

  const outPath = join(ICONSET_DIR, name);
  writeFileSync(outPath, png);
  log(`  OK: ${name} (${size}x${size})`);
}

// Convert iconset to .icns (macOS iconutil only)
if (process.platform === "darwin") {
  log("\n  Converting iconset to .icns...");
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${OUTPUT_ICNS}"`);
    log(`  OK: ${OUTPUT_ICNS}`);
  } catch (err) {
    log(`  WARN: iconutil failed (keeping existing icon.icns if present): ${err}`);
  }
} else {
  log("\n  Skipping .icns (iconutil is macOS-only)");
}

// Cleanup iconset
rmSync(ICONSET_DIR, { recursive: true, force: true });

// Generate multi-size .ico for Windows
log("\n  Building Windows .ico...");
const icoImages = [];
for (const size of ICO_SIZES) {
  const svg = appIconSvg(size);
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  icoImages.push({ width: size, height: size, data: png });
  log(`  OK: ico ${size}x${size}`);
}
writeFileSync(OUTPUT_ICO, buildIcoFromPngs(icoImages));
log(`  OK: ${OUTPUT_ICO}`);

// Generate settings hero icon (80px for 40px @2x display)
const heroSvg = appIconSvg(80);
const heroPng = await sharp(Buffer.from(heroSvg))
  .resize(80, 80)
  .png()
  .toBuffer();
writeFileSync(SETTINGS_HERO_ICON, heroPng);
log(`  OK: ${SETTINGS_HERO_ICON}`);

log("\nDone.");
