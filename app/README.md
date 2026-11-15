# Bitcoin Inheritance Planner: App (Android und iOS)

Dieser Ordner enthält **nur die App**. Die Webseite liegt im Hauptordner des Repos und kennt nichts von hier.

## Ein Code, zwei Ausgaben

```
Repo
├── index.html, diagram.js, diagram.css, assets/   ← gemeinsamer Kern (Webseite UND App)
├── sw.js, site.webmanifest                         ← nur Webseite (Offline-Modus im Browser)
└── app/                                            ← nur App
    ├── src/                                        ← App-Funktionen, nur hier definiert
    │   ├── planner-extras.js/.css                  Jahrescheck, Checkliste, Kalender-Eintrag, PDF-Checklistenseite
    │   └── app-shell.js/.css                       Pläne, Kalender, Einstellungen, PIN, Backup, Onboarding, Mobil-Zusammenfassung
    ├── scripts/build-www.mjs                       baut app/www aus Kern + src
    ├── android/, ios/, plugins/                    Capacitor-Projekte und kleine native Plugins (Druck, Kalender)
    └── resources/                                  Logo-Quellen für Icons und Startbild
```

- **Webseite:** Was im Hauptordner liegt, wird bei einem Push auf `master` mit `sync-to-clavastack.yml` auf die Webseite übertragen. Dort gibt es keinen PIN, keine Pläne-Liste und keinen Jahrescheck.
- **App:** `npm run build:www` kopiert die gemeinsamen Dateien nach `app/www`, hängt die Dateien aus `app/src` ein und trägt in jeder Datei eine neue Versionsnummer ein (damit die WebView nie veraltete Dateien verwendet). Capacitor verpackt das dann als Android- und iOS-App.
- **Erweiterungspunkte:** In `index.html` stehen wenige, mit "App-Erweiterungspunkt" markierte Zeilen (`window.PX`, zum Beispiel ein zusätzlicher Wizard-Schritt). Sie sind im Web inaktiv, weil `window.PX` dort nicht existiert. Die Pipeline prüft, dass `index.html` nie direkt auf App-Dateien verweist.
- **Fehlerkorrekturen** im gemeinsamen Kern (zum Beispiel Umlaute, Diagramm-Layout) wirken automatisch in beiden Ausgaben. Neue Funktionen, die nur die App haben soll, gehören nach `app/src`.

## Entwickeln

```bash
cd app
npm ci
npm run assets      # Logo und Icons neu erzeugen (nur nach Logo-Änderung)
npm run sync        # app/www bauen und in android/ios kopieren
npm run android     # öffnet Android Studio
npm run ios         # öffnet Xcode (nur auf dem Mac)
```

Nach jeder Änderung an einer Datei im Hauptordner oder in `app/src` muss `npm run sync` laufen, bevor die App neu gebaut wird.

## Automatisch bauen (GitHub Actions)

Workflow `.github/workflows/app.yml`. Er läuft bei Änderungen an `app/` und an den gemeinsamen Web-Dateien, nicht bei reinen Webseiten-Änderungen wie `sw.js`.

| Job | Was passiert |
|---|---|
| Prüfen | JavaScript-Syntax, Web-Teil bauen, prüfen, dass die Webseite ohne App-Dateien auskommt |
| Android | Debug-APK als Artefakt (zum Testen). Mit hinterlegtem Schlüssel zusätzlich signiertes Release-APK und AAB |
| iOS | Kompilier-Check auf macOS (ohne Signatur) |
| Release | Nur bei einem Tag `app-vX.Y.Z`: legt ein GitHub-Release mit dem Android-Build an |

Die Versionsnummer kommt aus der Build-Nummer (`versionCode` = Lauf-Nummer, `versionName` = 1.0.Lauf-Nummer).

**Signierte Android-Builds einschalten:** Im Repo unter *Settings > Secrets and variables > Actions* vier Secrets anlegen: `ANDROID_KEYSTORE_B64` (Base64 der Keystore-Datei), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Den Schlüssel einmal erzeugen und sicher sichern:

```bash
keytool -genkeypair -v -keystore release.keystore -alias upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 release.keystore    # Inhalt in ANDROID_KEYSTORE_B64 einfügen
```

Ohne den Schlüssel gibt es keine Updates über mehrere Versionen. Debug-Builds sind bei jedem Lauf anders signiert und lassen sich nicht über eine ältere Installation drüber installieren.

**Veröffentlichen:** `git tag app-v1.0.0 && git push origin app-v1.0.0`.

**iOS:** Die Pipeline prüft nur, dass das Projekt kompiliert. Für TestFlight und App Store braucht es ein Apple-Developer-Konto, Signatur-Zertifikate und ein Mac oder einen Cloud-Build-Dienst, siehe `STORE_LAUNCH.md`.

Weitere Details zu Funktionen, Store-Texten und Datenschutz: [STORE_LAUNCH.md](STORE_LAUNCH.md).
