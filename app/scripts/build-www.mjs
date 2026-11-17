// Builds app/www/ for Capacitor.
//
// One codebase, two outputs:
//   Website = the files in the repo root (index.html, diagram.js, diagram.css, assets/), unchanged.
//   App      = the same web files PLUS the app files from app/src (yearly check, PIN, plans, calendar ...).
// The app files are hooked into the copy of index.html here. The website itself never loads them.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(appRoot, '..');
const www = join(appRoot, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

// 1. Shared web files
for (const f of ['diagram.js', 'diagram.css']) copyFileSync(join(webRoot, f), join(www, f));
cpSync(join(webRoot, 'assets'), join(www, 'assets'), {
  recursive: true,
  filter: (src) => !/screenshot-|social-preview/.test(src),
});

// 2. App-only files
for (const f of ['planner-extras.js', 'planner-extras.css', 'app-shell.css']) {
  copyFileSync(join(appRoot, 'src', f), join(www, f));
}
// The version shown in Settings comes from the build (APP_VERSION, set by CI from the release tag), not from a constant in the source.
const pkgVersion = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version;
const appVersion = (process.env.APP_VERSION || pkgVersion).replace(/[^0-9A-Za-z.+-]/g, '');
const shellJs = readFileSync(join(appRoot, 'src', 'app-shell.js'), 'utf8');
if (!shellJs.includes('__APP_VERSION__')) throw new Error('app-shell.js: Versions-Platzhalter nicht gefunden');
writeFileSync(join(www, 'app-shell.js'), shellJs.replace('__APP_VERSION__', appVersion));
copyFileSync(join(appRoot, 'src', 'app-logo.svg'), join(www, 'assets', 'app-logo.svg'));

// 3. Self-hosted Roboto: the same local font files are used by the website and the app.
cpSync(join(webRoot, 'fonts'), join(www, 'fonts'), { recursive: true });

// 4. Derive index.html for the app
let html = readFileSync(join(webRoot, 'index.html'), 'utf8');
function mustReplace(re, replacement, what) {
  if (!re.test(html)) throw new Error('index.html: ' + what + ' nicht gefunden');
  html = html.replace(re, replacement);
}
if (!/<link rel="stylesheet" href="fonts\/fonts\.css">/.test(html)) throw new Error('index.html: local Roboto stylesheet not found');
// The Capacitor runtime (registerPlugin, isNativePlatform ...) must load as the first script. The native-bridge.js
// built into the app does not know registerPlugin without a bundler.
copyFileSync(join(appRoot, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(www, 'capacitor.js'));
// Content Security Policy for the app: nothing may be loaded from or sent to another host, no plugins, no frames,
// no forms, no <base>. Inline scripts stay allowed because the planner still uses inline event handlers; the
// network restriction is what limits the damage if a script ever gets injected (together with the missing INTERNET permission).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
mustReplace(/<head>/, '<head>\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<script src="capacitor.js"></script>', '<head>');
// Hook the app files in right after the diagram files (order: diagram, extensions, shell)
mustReplace(/(<link rel="stylesheet" href="diagram\.css[^"]*">)/, '$1\n<link rel="stylesheet" href="planner-extras.css">\n<link rel="stylesheet" href="app-shell.css">', 'diagram.css-Link');
mustReplace(/(<script src="diagram\.js[^"]*"><\/script>)/, '$1\n<script src="planner-extras.js"></script>\n<script src="app-shell.js"></script>', 'diagram.js-Skript');
// Every build gets a new version number in all file references so the WebView never uses stale files
// from its cache (the app is often updated with the same file names).
const stamp = Date.now().toString(36);
html = html.replace(/(diagram|planner-extras|app-shell)\.(css|js)(\?v=[0-9a-zA-Z-]+)?"/g, (m, n, ext) => n + '.' + ext + '?v=' + stamp + '"');
writeFileSync(join(www, 'index.html'), html);
console.log('www/ gebaut:', readdirSync(www).join(', '));
