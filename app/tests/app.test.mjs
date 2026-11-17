// Unit tests for the security relevant parts of the app.
//
// The app has no bundler: the code lives in classic browser scripts. These tests cut the relevant pieces out of the
// real source files (so they always test what ships) and run them in Node, which has the same Web Crypto API.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const read = (...p) => readFileSync(join(appRoot, ...p), 'utf8');

// Returns the part of `src` from the first match of `from` up to (not including) the first match of `to` after it.
function slice(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, 'start marker not found: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b > a, 'end marker not found: ' + to);
  return src.slice(a, b);
}

/* ---------- Plan import (index.html) ---------- */
function loadImport() {
  const html = read('..', 'index.html');
  const code =
    slice(html, 'var ADDR_TYPES', 'var ADDR_DEFAULT') + 'var ADDR_DEFAULT = "x";\n' +
    slice(html, 'var LIANA_MAX_TIMELOCK_BLOCKS', '// Seed-Phrase- / Passphrase-') +
    slice(html, 'var IMPORT_MAX_ITEMS', 'function applyLoadedState');
  return new Function(code + '\nreturn {normalizeLoadedState: normalizeLoadedState, defaultState: defaultState};')();
}

test('import: a hostile plan is forced into the expected shape', () => {
  const { normalizeLoadedState } = loadImport();
  const evil = JSON.parse(JSON.stringify({
    seeds: 'not a list',
    devices: [{ model: 5, smartcards: '3', companions: 'x' }, 7, null, ['a']],
    multisigs: [{ m: '2', n: 3, seeds: 'bad', cosigners: { a: 1 } }],
    contacts: 42,
    sw: 'oops',
    offline: 'yes',
  }));
  const raw = JSON.parse('{"__proto__": {"polluted": true}, "seeds": [{"backups": "bad", "wallet": 3, "pp": {}}]}');
  const out = normalizeLoadedState(evil);
  assert.ok(Array.isArray(out.seeds) && out.seeds.length === 0);
  assert.equal(out.devices.length, 1, 'only object entries survive');
  assert.equal(out.devices[0].model, '5', 'numbers in string fields are converted');
  assert.equal(out.devices[0].smartcards, 3, 'numeric strings in number fields are converted');
  assert.ok(Array.isArray(out.devices[0].companions));
  assert.ok(Array.isArray(out.multisigs[0].seeds) && Array.isArray(out.multisigs[0].cosigners));
  assert.equal(out.multisigs[0].m, 2);
  assert.ok(Array.isArray(out.contacts) && out.contacts.length === 0);
  assert.equal(typeof out.sw, 'object');
  assert.equal(out.offline, false);

  const out2 = normalizeLoadedState(raw);
  assert.equal(({}).polluted, undefined, 'Object.prototype must stay clean');
  assert.equal(out2.polluted, undefined);
  assert.ok(Array.isArray(out2.seeds[0].backups) && Array.isArray(out2.seeds[0].pp));
  assert.equal(typeof out2.seeds[0].wallet, 'object');
});

test('import: list sizes are capped and non-objects are rejected', () => {
  const { normalizeLoadedState } = loadImport();
  const many = { devices: Array.from({ length: 5000 }, () => ({ model: 'x' })) };
  assert.equal(normalizeLoadedState(many).devices.length, 200);
  assert.deepEqual(Object.keys(normalizeLoadedState(null)).sort(), Object.keys(normalizeLoadedState({})).sort());
  assert.deepEqual(Object.keys(normalizeLoadedState([1, 2])).sort(), Object.keys(normalizeLoadedState({})).sort());
});

/* ---------- Plan file encryption (index.html) ---------- */
function loadFileCrypto() {
  const html = read('..', 'index.html');
  const code = slice(html, 'var PBKDF2_ITER', '// ---- Passwort-Modal');
  const fn = new Function('state', code + '\nreturn {encryptState: encryptState, decryptState: decryptState, iterationsFor: iterationsFor, PBKDF2_ITER: PBKDF2_ITER};');
  return fn({ hello: 'plan' });
}

test('plan file: new files use 600k rounds and round-trip', async () => {
  const c = loadFileCrypto();
  const env = await c.encryptState('a long test password');
  assert.equal(env.iterations, 600000);
  assert.deepEqual(await c.decryptState('a long test password', env), { hello: 'plan' });
  await assert.rejects(c.decryptState('wrong password', env));
});

test('plan file: files from older versions (210k rounds) still open', async () => {
  const c = loadFileCrypto();
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode('old password 1'), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ old: true })));
  const b64 = (u8) => Buffer.from(u8).toString('base64');
  const env = { enc: 'AES-GCM', iterations: 210000, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) };
  assert.deepEqual(await c.decryptState('old password 1', env), { old: true });
});

test('plan file: crafted iteration counts are bounded', () => {
  const c = loadFileCrypto();
  assert.equal(c.iterationsFor({ iterations: 1e12 }), 210000);
  assert.equal(c.iterationsFor({ iterations: 5 }), 210000);
  assert.equal(c.iterationsFor({ iterations: 'x' }), 210000);
  assert.equal(c.iterationsFor({ iterations: 600000 }), 600000);
});

/* ---------- PIN key handling (app-shell.js) ---------- */
function loadShellCrypto() {
  const src = read('src', 'app-shell.js');
  const code = slice(src, 'var te = new TextEncoder()', 'function loadJson(key)');
  return new Function(code + '\nreturn {encBytes: encBytes, decBytes: decBytes, deriveKek: deriveKek, importDek: importDek, unwrapDek: unwrapDek, b64e: b64e, b64d: b64d};')();
}

test('pin: the data key is not extractable and survives wrap and unwrap', async () => {
  const s = loadShellCrypto();
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await s.importDek(raw);
  assert.equal(dek.extractable, false);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await s.deriveKek('12345678', salt, 1000);
  const wrapped = await s.encBytes(kek, raw);
  const data = await s.encBytes(dek, new TextEncoder().encode('secret plan'));

  const again = await s.unwrapDek(wrapped, await s.deriveKek('12345678', salt, 1000));
  assert.equal(again.extractable, false);
  assert.equal(new TextDecoder().decode(await s.decBytes(again, data)), 'secret plan');
  await assert.rejects(s.unwrapDek(wrapped, await s.deriveKek('87654321', salt, 1000)), 'wrong PIN must fail');
});

test('pin: changing the PIN keeps the same data key', async () => {
  const s = loadShellCrypto();
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await s.importDek(raw);
  const salt1 = crypto.getRandomValues(new Uint8Array(16)), salt2 = crypto.getRandomValues(new Uint8Array(16));
  const wrapped1 = await s.encBytes(await s.deriveKek('11111111', salt1, 1000), raw);
  // same steps as changePin: decrypt with the old PIN key, wrap with the new one
  const raw2 = await s.decBytes(await s.deriveKek('11111111', salt1, 1000), wrapped1);
  const wrapped2 = await s.encBytes(await s.deriveKek('22222222', salt2, 1000), raw2);
  const data = await s.encBytes(dek, new TextEncoder().encode('kept'));
  const dek2 = await s.unwrapDek(wrapped2, await s.deriveKek('22222222', salt2, 1000));
  assert.equal(new TextDecoder().decode(await s.decBytes(dek2, data)), 'kept');
});

/* ---------- Backup text (app-shell.js) ---------- */
function loadPack() {
  const src = read('src', 'app-shell.js');
  const code = slice(src, 'var te = new TextEncoder()', 'function parseEnc') + slice(src, 'var BACKUP_NOTE_LIMIT', 'function copyText(text)');
  return new Function(code + '\nreturn {packText: packText, unpackText: unpackText};')();
}

test('backup text: round trip', async () => {
  const p = loadPack();
  const text = JSON.stringify({ a: 'äöü', b: [1, 2, 3] });
  assert.equal(await p.unpackText(await p.packText(text)), text);
});

test('backup text: gzip bombs and oversized input are refused', async () => {
  const p = loadPack();
  const bomb = await p.packText('0'.repeat(20 * 1024 * 1024));
  assert.ok(bomb.length < 100000, 'the bomb itself is small');
  await assert.rejects(p.unpackText(bomb), /too-large/);
  await assert.rejects(p.unpackText('x'.repeat(4000000)), /too-large/);
});

/* ---------- Checklist and calendar (planner-extras.js) ---------- */
function loadExtras(state) {
  const win = { Capacitor: undefined };
  const fn = new Function('window', 'document', 'state', read('src', 'planner-extras.js'));
  fn(win, { documentElement: { classList: { add() {} } } }, state);
  return win.PX;
}
const emptyState = () => ({ devices: [], seeds: [], ex: { count: 0 }, pwm: { use: null }, multisigs: [], lianaWallets: [], timelock: {}, dig: {}, reminder: { on: true, date: '2027-03-01', time: '10:00' } });

test('checklist state: unsafe ids and prototype keys are removed', () => {
  const PX = loadExtras(emptyState());
  const dirty = JSON.parse('{"__proto__": {"x": 1}, "constructor": 1, "checkCustom": {"add": [{"id": "x\');alert(1);(\'", "t": "bad"}, {"id": "u1ok", "t": "' + 'a'.repeat(500) + '"}, {"id": 5, "t": "n"}], "removed": ["fine-1", "a b", "x\');//"]}}');
  const clean = PX.sanitizeState(dirty);
  assert.equal(clean.constructor, Object);
  assert.deepEqual(clean.checkCustom.add.map((a) => a.id), ['u1ok']);
  assert.equal(clean.checkCustom.add[0].t.length, 140);
  assert.deepEqual(clean.checkCustom.removed, ['fine-1']);
  assert.deepEqual(PX.sanitizeState('x'), {});
  assert.deepEqual(PX.sanitizeState([1]), {});
});

test('calendar entry carries no plan details', () => {
  const st = emptyState();
  st.seeds = [{ name: 'Tresor Bank Mueller', backups: [{ type: 'metal', bagNo: '4711' }], passphrases: 0 }];
  const PX = loadExtras(st);
  PX.host.planName = () => 'Erbe fuer Familie Mueller';
  const ics = PX.buildIcs({ date: '2027-03-01', time: '10:00', planNo: 2, planId: 'abc' });
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(!/Tresor|Mueller|4711|Familie/.test(ics), 'no plan details in the calendar file');
  assert.ok(/SUMMARY:.*Plan 2/.test(ics), 'plans are told apart by number only');
  const first = PX.buildIcs({ date: '2027-03-01', time: '10:00', planNo: 1, planId: 'abc' });
  assert.ok(!/Plan 1/.test(first));
});
