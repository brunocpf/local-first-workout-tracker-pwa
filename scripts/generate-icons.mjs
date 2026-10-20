// One-off: regenerates the PNG icons in static/ from static/icon.svg.
// Not a dependency: run `npm i --no-save sharp && node scripts/generate-icons.mjs static`.
import sharp from "sharp";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const any = readFileSync(`${out}/icon.svg`);
const glyph = `<path d="M96 256h320M144 176v160M368 176v160M200 208v96M312 208v96" stroke="#4ade80" stroke-width="28" stroke-linecap="round" fill="none"/>`;
const square = (scale) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b0b0f"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph}</g></svg>`);
const png = (svg, size, name) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(`${out}/${name}`);
await png(any, 192, "icon-192.png");
await png(any, 512, "icon-512.png");
await png(square(0.8), 512, "icon-maskable-512.png"); // glyph spans ~66% width: inside the 80% safe zone
await png(square(1), 180, "apple-touch-icon.png"); // iOS applies its own rounded mask; keep it full-bleed
