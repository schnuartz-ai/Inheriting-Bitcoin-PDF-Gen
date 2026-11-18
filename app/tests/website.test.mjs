// Checks for the shared website core and the clean-up work in this branch:
// self-hosted Roboto (no Google Fonts), no duplicated inline logo, no dead code,
// and the English/German labels for the Liana timelock and seed fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const repoRoot = join(appRoot, '..');
const read = (...p) => readFileSync(join(repoRoot, ...p), 'utf8');
function slice(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, 'start marker not found: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b > a, 'end marker not found: ' + to);
  return src.slice(a, b);
}

test('website uses local Roboto, not Google Fonts', () => {
  const html = read('index.html');
  assert.ok(!html.includes('fonts.googleapis.com'), 'no Google Fonts request');
  assert.ok(!html.includes('Montserrat'), 'Montserrat is gone');
  assert.ok(html.includes('fonts/fonts.css'), 'local Roboto stylesheet is linked');
  assert.ok(html.includes("font-family: 'Roboto'"), 'Roboto is the UI font');
  assert.ok(existsSync(join(repoRoot, 'fonts', 'fonts.css')), 'fonts.css exists');
  assert.ok(existsSync(join(repoRoot, 'fonts', 'roboto-latin-400-normal.woff2')), 'Roboto woff2 exists');
  assert.ok(existsSync(join(repoRoot, 'fonts', 'LICENSE.txt')), 'Roboto license exists');
  assert.ok(existsSync(join(repoRoot, 'fonts', 'ORIGIN.md')), 'Roboto origin documented');
  assert.match(read('fonts', 'LICENSE.txt'), /SIL OPEN FONT LICENSE Version 1.1/);
});

test('website does not duplicate the logo inline and keeps no dead logo file', () => {
  const html = read('index.html');
  assert.ok(!html.includes('data:image/png;base64'), 'no inline base64 logo');
  assert.ok(!existsSync(join(repoRoot, 'logo_b64.txt')), 'unused logo_b64.txt removed');
  assert.ok(html.includes('assets/clavastack-logo.png'), 'logo is loaded from the shared asset');
});

test('dead code removed from the website core', () => {
  const html = read('index.html');
  assert.ok(!html.includes('EMBEDDED'), 'unused embedded flag removed');
  assert.ok(!html.includes('secTitle9'), 'unused security tip removed');
  assert.ok(!html.includes('preloadAllImages'), 'unconditional image preload removed');
});

test('Liana timelock and seed fallback are bilingual', () => {
  const html = read('index.html');
  const code =
    slice(html, 'function tr(de,en)', 'function toggleLang') +
    'var ADDR_DEFAULT="x"; var state={seeds:[{name:""}]};\n' +
    slice(html, 'var LIANA_MAX_TIMELOCK_BLOCKS', 'function ensureArrayLen') +
    slice(html, 'function seedName', 'function newDevice') +
    '\nreturn {tr:tr, lwTimelockLabel:lwTimelockLabel, seedName:seedName};';
  const api = new Function('LANG', code);
  const en = api('en');
  const de = api('de');
  assert.equal(en.lwTimelockLabel({ timelockUnit: 'blocks', timelockValue: 10 }), '10 blocks');
  assert.equal(de.lwTimelockLabel({ timelockUnit: 'blocks', timelockValue: 10 }), '10 Blöcke');
  assert.equal(en.seedName(0), 'Seed #1');
  assert.equal(de.seedName(0), 'Seed-Phrase #1');
});

test('software wallets have exactly one English recovery text each', () => {
  const html = read('index.html');
  const start = html.indexOf('var SOFTWARE_WALLETS = [');
  const end = html.indexOf('function getSwWallet');
  assert.ok(start >= 0 && end > start, 'SOFTWARE_WALLETS block found');
  const block = html.slice(start, end);
  const entries = block.split(/(?=\{label:")/).filter((chunk) => chunk.includes('label:"'));
  assert.ok(entries.length > 15, 'wallet entries found');
  for (const chunk of entries) {
    const label = /label:"([^"]+)"/.exec(chunk);
    assert.ok(label, 'wallet label');
    if (label[1] === 'Andere') continue;
    const englishCount = (chunk.match(/recoveryEn:"/g) || []).length;
    assert.equal(englishCount, 1, label[1] + ' must have exactly one recoveryEn');
    const de = /recovery:"((?:[^"\\]|\\.)*)"/.exec(chunk);
    const en = /recoveryEn:"((?:[^"\\]|\\.)*)"/.exec(chunk);
    assert.ok(de && en, label[1] + ' must have German and English recovery text');
    assert.notEqual(en[1], de[1], label[1] + ' English text must differ from German');
  }
});

test('service worker and sync workflow carry the local fonts and manifest', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes('fonts/fonts.css'), 'service worker caches local fonts');
  assert.ok(!sw.includes('fonts.googleapis.com'), 'service worker has no Google Fonts host');
  const sync = read('.github/workflows/sync-to-clavastack.yml');
  assert.ok(sync.includes('site.webmanifest'), 'manifest is synced to the website');
  assert.ok(sync.includes('fonts/'), 'fonts are synced to the website');
  const build = read('app', 'scripts', 'build-www.mjs');
  assert.ok(build.includes("join(webRoot, 'fonts')"), 'app build copies the shared fonts');
  assert.ok(!build.includes('@fontsource/montserrat'), 'old Montserrat dependency is gone');
});
