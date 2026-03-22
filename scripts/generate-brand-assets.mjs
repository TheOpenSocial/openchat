#!/usr/bin/env node
/**
 * Rasterizes packages/brand/assets/logo.svg and copies it into each app.
 * Run: pnpm brand:generate
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_SVG = join(ROOT, "packages/brand/assets/logo.svg");

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

async function main() {
  const svgBuffer = readFileSync(SOURCE_SVG);

  const mobileAssets = join(ROOT, "apps/mobile/assets");
  const mobileBrand = join(mobileAssets, "brand");
  const webPublicBrand = join(ROOT, "apps/web/public/brand");
  const adminPublicBrand = join(ROOT, "apps/admin/public/brand");

  ensureDir(mobileBrand);
  ensureDir(webPublicBrand);
  ensureDir(adminPublicBrand);

  // --- Expo / mobile: solid black plate behind mark (launcher / adaptive icon) ---
  const iconForeground = await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toBuffer();
  async function writeBlackAppIcon(outPath) {
    await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: BLACK },
    })
      .composite([{ input: iconForeground, gravity: "center" }])
      .png()
      .toFile(outPath);
  }
  await writeBlackAppIcon(join(mobileAssets, "icon.png"));
  await writeBlackAppIcon(join(mobileAssets, "adaptive-icon.png"));

  const logoCore = await sharp(svgBuffer).resize(720, 720).png().toBuffer();
  await sharp({
    create: {
      width: 1284,
      height: 2778,
      channels: 4,
      background: BLACK,
    },
  })
    .composite([{ input: logoCore, gravity: "center" }])
    .png()
    .toFile(join(mobileAssets, "splash.png"));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(mobileBrand, "logo.png"));
  copyFileSync(SOURCE_SVG, join(mobileBrand, "logo.svg"));

  // --- Web + admin: public SVG ---
  copyFileSync(SOURCE_SVG, join(webPublicBrand, "logo.svg"));
  copyFileSync(SOURCE_SVG, join(adminPublicBrand, "logo.svg"));

  // --- Next.js metadata icons (app/icon.png, app/apple-icon.png) ---
  const webApp = join(ROOT, "apps/web/app");
  const adminApp = join(ROOT, "apps/admin/app");
  ensureDir(webApp);
  ensureDir(adminApp);

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(webApp, "icon.png"));
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(join(webApp, "apple-icon.png"));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(adminApp, "icon.png"));
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(join(adminApp, "apple-icon.png"));

  console.log("Brand assets generated from packages/brand/assets/logo.svg");
  console.log("  apps/mobile/assets/{icon,adaptive-icon,splash}.png");
  console.log("  apps/mobile/assets/brand/{logo.png,logo.svg}");
  console.log(
    "  apps/web + apps/admin: public/brand/logo.svg, app/{icon,apple-icon}.png",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
