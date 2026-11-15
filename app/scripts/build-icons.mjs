// Renders the app logo into all PNG sources for @capacitor/assets (npm run assets).
// Logo: a Bitcoin coin branching out to three people (inheritance), Specter/ClavaStack brand colors.
// If the original file is at resources/logo-source.png it is used instead of the vector recreation.
import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'resources');
mkdirSync(out, { recursive: true });

const DARK = '#04070B';
const BLUE = '#1F99E5';

// Canvas 1254 x 1254, motif center about (626, 630)
const motif = (c = BLUE) => `
  <g fill="none" stroke="${c}">
    <circle cx="622" cy="425" r="232" stroke-width="48"/>
    <path d="M625.5 680 V835" stroke-width="41"/>
    <path d="M328 852 V812 Q328 757.5 383 757.5 H868 Q923 757.5 923 812 V852" stroke-width="41"/>
  </g>
  <path fill="${c}" fill-rule="evenodd" d="M517 318 H665 C715 318 745 345 745 385 C745 408 733 422 715 430 C737 438 750 458 750 480 C750 515 715 532 665 532 H517 L521 495 H548 V355 H517 Z M603 355 H650 C668 355 678 365 678 380 C678 396 668 406 650 406 H603 Z M603 437 H655 C675 437 686 450 686 466 C686 482 675 495 655 495 H603 Z M574 275 H610 V318 H574 Z M628 275 H664 V318 H628 Z M574 532 H610 V575 H574 Z M628 532 H664 V575 H628 Z"/>
  <g fill="${c}">
    <circle cx="625" cy="912" r="62"/><path d="M505 1093 A120 106 0 0 1 745 1093 Z"/>
    <circle cx="328" cy="920" r="56"/><path d="M220 1077 A107.5 92 0 0 1 435 1077 Z"/>
    <circle cx="924" cy="920" r="56"/><path d="M817 1077 A107.5 92 0 0 1 1032 1077 Z"/>
  </g>`;

const place = (scale) => `<g transform="translate(627 627) scale(${scale}) translate(-626 -630)">${motif()}</g>`;
const doc = (inner, bg = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254">${bg ? `<rect width="1254" height="1254" fill="${DARK}"/>` : ''}${inner}</svg>`;
const png = (xml, file, size) => sharp(Buffer.from(xml)).resize(size, size).png().toFile(join(out, file));

writeFileSync(join(out, 'logo.svg'), doc(place(1)));
// Transparent logo for the app UI (onboarding, empty views)
writeFileSync(join(root, 'src', 'app-logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="190 150 860 960">${motif()}</svg>\n`);

const src = join(out, 'logo-source.png');
if (existsSync(src)) {
  await sharp(src).resize(1024, 1024).png().toFile(join(out, 'icon-only.png'));
  await sharp(src).resize(512, 512).png().toFile(join(out, 'play-store-icon-512.png'));
  console.log('Originaldatei logo-source.png verwendet');
} else {
  await png(doc(place(1)), 'icon-only.png', 1024);
  await png(doc(place(1)), 'play-store-icon-512.png', 512);
}
// Adaptive icon (Android): foreground inside the safe zone, plain background
await png(doc(place(0.7), false), 'icon-foreground.png', 1024);
await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${DARK}"/></svg>`, 'icon-background.png', 1024);

// Splash: logo centered, smaller, on brand black
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${DARK}"/><g transform="translate(1366 1366) scale(0.85) translate(-626 -630)">${motif()}</g></svg>`;
await sharp(Buffer.from(splash)).png().toFile(join(out, 'splash.png'));
await sharp(Buffer.from(splash)).png().toFile(join(out, 'splash-dark.png'));
console.log('Icons geschrieben nach', out);
