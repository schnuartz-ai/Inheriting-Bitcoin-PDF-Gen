// Creates the Android signing keystore and random passwords on YOUR machine, outside the repository.
//
// Usage (from the repo root):   node app/scripts/make-keystore.mjs [output-folder]
//
// The secret values are written to files and are NEVER printed to the terminal.
// Default output folder: <home>/bitcoin-inheritance-planner-signing
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = resolve(process.argv[2] || join(homedir(), 'bitcoin-inheritance-planner-signing'));

// Never write key material inside the repository (it could be committed by accident).
const rel = relative(repoRoot, outDir);
if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
  console.error('Refusing to write inside the repository: ' + outDir);
  process.exit(1);
}

const keystore = join(outDir, 'release.keystore');
if (existsSync(keystore)) {
  console.error('A keystore already exists at ' + keystore + '\nRefusing to overwrite it. Move it away on purpose if you really want a new key.');
  process.exit(1);
}

// Find keytool (comes with every JDK).
const exe = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
const candidates = [process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', exe), exe].filter(Boolean);
const keytool = candidates.find((c) => spawnSync(c, ['-help'], { stdio: 'ignore' }).status === 0);
if (!keytool) {
  console.error('keytool not found. Install a JDK (21 recommended) or set JAVA_HOME, then run this again.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const alias = 'upload';
const storePass = randomBytes(24).toString('base64url');
// PKCS12 keystores (the default since Java 9) use ONE password for store and key, so both secrets get the same value.
const keyPass = storePass;
const env = { ...process.env, KS_PASS: storePass };

// Passwords go to keytool through environment variables, not through the command line.
const gen = spawnSync(keytool, [
  '-genkeypair', '-keystore', keystore, '-alias', alias,
  '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
  '-dname', 'CN=Bitcoin Inheritance Planner, O=ClavaStack',   // no personal name in the certificate
  '-storepass:env', 'KS_PASS',
], { env, stdio: 'inherit' });
if (gen.status !== 0) { console.error('keytool failed.'); process.exit(1); }

const files = {
  'ANDROID_KEYSTORE_B64': readFileSync(keystore).toString('base64'),
  'ANDROID_KEYSTORE_PASSWORD': storePass,
  'ANDROID_KEY_ALIAS': alias,
  'ANDROID_KEY_PASSWORD': keyPass,
};
for (const [name, value] of Object.entries(files)) {
  const f = join(outDir, name + '.txt');
  writeFileSync(f, value);
  try { chmodSync(f, 0o600); } catch { /* not supported on Windows */ }
}
try { chmodSync(keystore, 0o600); } catch { /* not supported on Windows */ }

// The certificate fingerprint is public information (shown by app stores), safe to print.
const list = spawnSync(keytool, ['-list', '-v', '-keystore', keystore, '-alias', alias, '-storepass:env', 'KS_PASS'], { env, encoding: 'utf8' });
const sha = (list.stdout || '').split('\n').find((l) => l.trim().startsWith('SHA256:'));

console.log('\nDone. Nothing secret was printed.\n');
console.log('Folder: ' + outDir);
console.log('  release.keystore                the key itself (back it up!)');
for (const name of Object.keys(files)) console.log('  ' + name + '.txt');
if (sha) console.log('\nCertificate ' + sha.trim());
console.log(`
Next steps:
  1. Back up the WHOLE folder in two places (password manager attachment + offline copy).
     Without the keystore and passwords there are no app updates for installed users.
  2. In GitHub: Settings > Secrets and variables > Actions > New repository secret.
     Create the four secrets named like the four .txt files, and paste the content of each file as the value.
  3. Never commit this folder or paste its content into chats or issues.
`);
