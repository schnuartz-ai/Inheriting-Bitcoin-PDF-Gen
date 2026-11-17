# Bitcoin Inheritance Planner: mobile app (Android and iOS)

This folder contains **only the app**. The website lives in the repo root and knows nothing about it.

## One codebase, two outputs

```
Repo
├── index.html, diagram.js, diagram.css, assets/   ← shared core (website AND app)
├── sw.js, site.webmanifest                         ← website only (offline mode in the browser)
└── app/                                            ← app only
    ├── src/                                        ← app features, defined here only
    │   ├── planner-extras.js/.css                  yearly check, checklist, calendar event, PDF checklist page
    │   └── app-shell.js/.css                       plans, calendar, settings, PIN, backup, onboarding, mobile summary
    ├── scripts/build-www.mjs                       builds app/www from core + src
    ├── android/, ios/, plugins/                    Capacitor projects and small native plugins (print, calendar)
    └── resources/                                  logo sources for icons and splash screens
```

- **Website:** Everything in the repo root is published to the website by `sync-to-clavastack.yml` on every push to `master`. It has no PIN, no plans list and no yearly check.
- **App:** `npm run build:www` copies the shared files to `app/www`, hooks in the files from `app/src` and writes a fresh version number into every file reference (so the WebView never uses stale cached files). Capacitor then packages the result as an Android and an iOS app.
- **Extension points:** `index.html` contains a few lines marked "app extension point" (they check `window.PX`, for example an additional wizard step). They are inactive on the website because `window.PX` does not exist there. CI checks that `index.html` never references app files directly.
- **Bug fixes** in the shared core (for example character escaping or the diagram layout) automatically apply to both outputs. New features that only the app should have belong in `app/src`.

## Develop

```bash
cd app
npm ci
npm run assets      # regenerate logo and icons (only after a logo change)
npm run sync        # build app/www and copy it into android/ios
npm test            # unit tests for import, PIN crypto, backup text, calendar privacy
npm run android     # opens Android Studio
npm run ios         # opens Xcode (macOS only)
```

Run `npm run sync` after every change to a file in the repo root or in `app/src` before rebuilding the app.

## Automatic builds (GitHub Actions)

Workflow `.github/workflows/app.yml`. It runs on changes to `app/` and to the shared web files, not on website-only changes such as `sw.js`.

| Job | What it does |
|---|---|
| Check | JavaScript syntax, unit tests (`npm test`), builds the web part, verifies that the website works without app files |
| Android | Debug APK as an artifact (for testing). With a signing key configured it also builds a signed release APK and AAB |
| iOS | Compile check on macOS (unsigned) |
| Release | Only for a tag `app-vX.Y.Z`: creates a GitHub release with the Android build |

The version: `versionCode` is the run number. `versionName` (and the version shown in Settings) is the release tag without the `app-v` prefix for tag builds, otherwise `1.0.<run number>`. Release assets include `SHA256SUMS.txt`.

**Enable signed Android builds (the secret values never need to be shown to anyone):**

1. Run the helper on your own machine (it needs a JDK for `keytool`; Node is already required):

   ```bash
   node app/scripts/make-keystore.mjs
   ```

   It creates `release.keystore` and four small text files in a folder **outside** the repo (default: `~/bitcoin-inheritance-planner-signing`). It refuses to write inside the repo and never prints the secret values.
2. Back up the whole folder in two places (for example a password manager attachment and an offline copy). Without the keystore and its password there are no app updates for installed users.
3. In GitHub open *Settings > Secrets and variables > Actions > New repository secret* and create four secrets, named exactly like the files, with the file content as the value: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. Push to `master` or push a tag. Signed builds run only there, never for pull requests.

Without the key there are no updates across versions: debug builds are signed differently on every run and cannot be installed over an older installation. Optionally protect the secrets further with a GitHub *Environment* that requires your approval.

**Publish:** `git tag app-v1.0.0 && git push origin app-v1.0.0`.

**iOS:** The pipeline only checks that the project compiles. TestFlight and the App Store need an Apple Developer account, signing certificates and a Mac or a cloud build service, see `STORE_LAUNCH.md`.

More details on features, store listing and privacy: [STORE_LAUNCH.md](STORE_LAUNCH.md).
