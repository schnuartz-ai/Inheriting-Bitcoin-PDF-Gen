// Functional tests for the legacy 6-digit PIN and the PIN -> password migration.
// The app has no bundler, so the relevant part of app-shell.js is evaluated in Node
// with an in-memory Preferences store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const read = (...p) => readFileSync(join(appRoot, ...p), 'utf8');
function slice(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, 'start marker not found: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b > a, 'end marker not found: ' + to);
  return src.slice(a, b);
}

function loadLockApi() {
  const src = read('src', 'app-shell.js');
  let code = slice(src, 'var T = PX.T', 'function loadIndexAndShow');
  code = code.replace(/var index = \[\];[^\n]*\n/, '');
  const index = [];
  const PX = {
    host: {},
    T: (de, en) => de,
    e: (s) => String(s == null ? '' : s),
    store: {},
    plug: () => null
  };
  const window = {};
  const document = {};
  const api = new Function('index', 'PX', 'window', 'document', '$', 'T', 'e', 'crypto',
    code + `
return {
  pin: pin, store: store,
  KEY_PIN: KEY_PIN, KEY_FAIL: KEY_FAIL, KEY_PLAN: KEY_PLAN, KEY_INDEX: KEY_INDEX,
  enableLock: enableLock, disableLock: disableLock, changePassword: changePassword,
  verifyPassword: verifyPassword, failInfo: failInfo,
  loadJson: loadJson, saveJson: saveJson,
  deriveKek: deriveKek, encBytes: encBytes, decBytes: decBytes, importDek: importDek,
  unwrapDek: unwrapDek, b64e: b64e, b64d: b64d, PW_ITER: PW_ITER, PW_MIN_NEW: PW_MIN_NEW
};`)(index, PX, window, document, () => null, (de, en) => de, (s) => String(s == null ? '' : s), crypto);

  const mem = new Map();
  api.store.get = async (key) => (mem.has(key) ? mem.get(key) : null);
  api.store.set = async (key, value) => { mem.set(key, value); };
  api.store.remove = async (key) => { mem.delete(key); };
  api.store.keys = async () => ({ keys: Array.from(mem.keys()) });
  api.store.setVerified = async (key, value) => {
    await api.store.set(key, value);
    const back = await api.store.get(key);
    if (back !== value) throw new Error('write-verify');
  };
  return { api, mem, index };
}

test('legacy 6-digit PIN unlocks and wrong attempts are rate-limited', async () => {
  const { api } = loadLockApi();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const kek = await api.deriveKek('123456', salt, 400000);
  const wrapped = await api.encBytes(kek, raw);
  api.pin.meta = { salt: api.b64e(salt), iter: 400000, wrapped };
  api.pin.key = null;

  assert.equal(await api.verifyPassword('123456'), null);
  assert.ok(api.pin.key, 'legacy PIN sets the data key');

  api.pin.key = null;
  assert.match(await api.verifyPassword('000000'), /Falsches Passwort/);
  for (let i = 0; i < 4; i++) await api.verifyPassword('000000');
  assert.match(await api.verifyPassword('123456'), /Bitte warte/);
  await api.store.remove(api.KEY_FAIL);
  assert.equal(await api.verifyPassword('123456'), null);
});

test('PIN -> password migration, restart, password change, remove and re-enable', async () => {
  const { api, mem, index } = loadLockApi();
  index.push({ id: 'p1' });
  mem.set(api.KEY_PLAN + 'p1', JSON.stringify({ id: 'p1', state: { answer: 42 } }));
  mem.set(api.KEY_INDEX, JSON.stringify(index));

  await api.enableLock('correct horse battery staple');
  assert.ok(api.pin.meta, 'key material stored');
  assert.ok(api.pin.key, 'data key available after enabling');
  assert.match(mem.get(api.KEY_PLAN + 'p1'), /"v":1/, 'plan is encrypted');
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);

  // Simulate an app restart: key material is on disk, the data key is not in memory.
  api.pin.key = null;
  await assert.rejects(api.loadJson(api.KEY_PLAN + 'p1'), /locked/);
  assert.equal(await api.verifyPassword('correct horse battery staple'), null);
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);

  await api.changePassword('correct horse battery staple', 'new password 12345');
  api.pin.key = null;
  assert.match(await api.verifyPassword('correct horse battery staple'), /Falsches Passwort/);
  assert.equal(await api.verifyPassword('new password 12345'), null);
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);

  await api.disableLock();
  assert.equal(api.pin.meta, null);
  assert.equal(api.pin.key, null);
  assert.doesNotMatch(mem.get(api.KEY_PLAN + 'p1'), /"v":1/, 'plan is plaintext again');
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);

  await api.enableLock('another password 123');
  assert.ok(api.pin.meta, 'encryption can be enabled again');
});

test('a failed save during enableLock rejects but keeps the plan readable', async () => {
  const { api, mem, index } = loadLockApi();
  index.push({ id: 'p1' });
  mem.set(api.KEY_PLAN + 'p1', JSON.stringify({ id: 'p1', state: { answer: 42 } }));
  const originalSet = api.store.set;
  let failed = false;
  api.store.set = async (key, value) => {
    if (key === api.KEY_PLAN + 'p1' && !failed) { failed = true; throw new Error('disk full'); }
    return originalSet(key, value);
  };
  await assert.rejects(api.enableLock('correct horse battery staple'), /disk full/);
  assert.ok(api.pin.meta, 'key material is written before the plan rewrite');
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);
});

test('a failed save during disableLock restores the lock state and keeps the plan readable', async () => {
  const { api, mem, index } = loadLockApi();
  index.push({ id: 'p1' });
  mem.set(api.KEY_PLAN + 'p1', JSON.stringify({ id: 'p1', state: { answer: 42 } }));
  await api.enableLock('correct horse battery staple');
  const originalSet = api.store.set;
  let failed = false;
  api.store.set = async (key, value) => {
    if (key === api.KEY_PLAN + 'p1' && !failed) { failed = true; throw new Error('disk full'); }
    return originalSet(key, value);
  };
  await assert.rejects(api.disableLock(), /disk full/);
  assert.ok(api.pin.meta, 'lock state is restored');
  assert.equal((await api.loadJson(api.KEY_PLAN + 'p1')).state.answer, 42);
});
