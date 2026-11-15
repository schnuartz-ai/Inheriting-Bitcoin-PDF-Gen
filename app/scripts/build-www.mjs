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
  filter: (src) => !/screenshot-|social-preview|logo-datauri/.test(src),
});

// 2. App-only files
for (const f of ['planner-extras.js', 'planner-extras.css', 'app-shell.js', 'app-shell.css']) {
  copyFileSync(join(appRoot, 'src', f), join(www, f));
}
copyFileSync(join(appRoot, 'src', 'app-logo.svg'), join(www, 'assets', 'app-logo.svg'));

// 3. Montserrat locally (latin + latin-ext, weights 400-800), no Google Fonts request in the app
const fontDir = join(www, 'fonts');
mkdirSync(fontDir, { recursive: true });
const fsrc = join(appRoot, 'node_modules', '@fontsource', 'montserrat', 'files');
let css = '';
for (const w of [400, 500, 600, 700, 800]) {
  for (const subset of ['latin', 'latin-ext']) {
    const name = `montserrat-${subset}-${w}-normal.woff2`;
    copyFileSync(join(fsrc, name), join(fontDir, name));
    const range = subset === 'latin'
      ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
      : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
    css += `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${w};font-display:swap;src:url(${name}) format('woff2');unicode-range:${range};}\n`;
  }
}
writeFileSync(join(fontDir, 'fonts.css'), css);

// 4. Derive index.html for the app
let html = readFileSync(join(webRoot, 'index.html'), 'utf8');
function mustReplace(re, replacement, what) {
  if (!re.test(html)) throw new Error('index.html: ' + what + ' nicht gefunden');
  html = html.replace(re, replacement);
}
mustReplace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">', 'Google-Fonts-Link');
// The Capacitor runtime (registerPlugin, isNativePlatform ...) must load as the first script. The native-bridge.js
// built into the app does not know registerPlugin without a bundler.
copyFileSync(join(appRoot, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(www, 'capacitor.js'));
mustReplace(/<head>/, '<head>\n<script src="capacitor.js"></script>', '<head>');
// Hook the app files in right after the diagram files (order: diagram, extensions, shell)
mustReplace(/(<link rel="stylesheet" href="diagram\.css[^"]*">)/, '$1\n<link rel="stylesheet" href="planner-extras.css">\n<link rel="stylesheet" href="app-shell.css">', 'diagram.css-Link');
mustReplace(/(<script src="diagram\.js[^"]*"><\/script>)/, '$1\n<script src="planner-extras.js"></script>\n<script src="app-shell.js"></script>', 'diagram.js-Skript');
// Every build gets a new version number in all file references so the WebView never uses stale files
// from its cache (the app is often updated with the same file names).
const stamp = Date.now().toString(36);
html = html.replace(/(diagram|planner-extras|app-shell)\.(css|js)(\?v=[0-9a-zA-Z-]+)?"/g, (m, n, ext) => n + '.' + ext + '?v=' + stamp + '"');
writeFileSync(join(www, 'index.html'), html);
console.log('www/ gebaut:', readdirSync(www).join(', '));
