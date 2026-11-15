# Bitcoin Inheritance Planner: Mobile App und Store-Launch

> Alle Pfade und Befehle in dieser Datei beziehen sich auf den Ordner `app/`. Aufbau und automatische Builds: [README.md](README.md).

Die App ist ein Capacitor-Wrapper um den bestehenden Planer. Es gibt weiterhin nur **eine** Codebasis (`index.html`, `diagram.js`, `src/planner-extras.js`). Der Ordner `www/` wird daraus gebaut, `android/` und `ios/` sind die nativen Projekte.

| | |
|---|---|
| App-Name | Bitcoin Inheritance Planner |
| Bundle-ID / Application-ID | `com.clavastack.inheritanceplanner` |
| Version | 1.0 (Build 1) |
| Logo | `resources/logo.svg`, Quellen in `resources/`, erzeugt mit `npm run assets` |

Name und ID ändern: `capacitor.config.json` (Name, ID), danach in `android/app/build.gradle` (`applicationId`, `namespace`) und im Xcode-Projekt (`PRODUCT_BUNDLE_IDENTIFIER`, `CFBundleDisplayName` in `ios/App/App/Info.plist`) anpassen. Die ID kann nach dem ersten Store-Upload nicht mehr geändert werden.

## Was die App kann (zusätzlich zum Web-Planer)

- **App-Oberfläche (`src/app-shell.js`, nur in der App):** Beim ersten Start wählt man Deutsch oder Englisch und sieht eine kurze Übersicht. Unten gibt es immer die Leiste **Pläne, Kalender, Einstellungen**. In "Pläne" liegen mehrere lokal gespeicherte Pläne (weiter bearbeiten, ansehen, umbenennen, duplizieren, löschen). Der "Kalender" zeigt die Jahrescheck-Termine aller Pläne, erledigte Checks erscheinen grün. Nach dem PDF fragt die App, ob ein Jahrescheck eingerichtet werden soll. "Einstellungen" enthalten Sprache, Benachrichtigungen, Einführung, Erstgespräch und "Alle Daten löschen".
- **Jahrescheck:** Neuer Wizard-Schritt "Jahrescheck" vor der Zusammenfassung. Nutzer wählen Datum und Uhrzeit. Die App plant lokale Benachrichtigungen für die nächsten 5 Jahre und füllt sie bei jedem App-Start nach. Zusätzlich gibt es einen Kalendereintrag (.ics, jährlich wiederkehrend, Erinnerung 1 Woche vorher und am Tag).
- **PIN-Schutz (optional, Einstellungen > Sicherheit):** 6 bis 12 Ziffern. Alle Pläne, der Plan-Index und die Termine werden mit AES-256-GCM verschlüsselt. Ein zufälliger Datenschlüssel wird durch die PIN (PBKDF2-SHA256, 400000 Runden) geschützt, deshalb lässt sich die PIN ändern, ohne die Daten neu zu verschlüsseln. Die App sperrt sich nach 30 Sekunden im Hintergrund, nach 5 Fehlversuchen gibt es Wartezeiten (30 s, verdoppelt bis 15 min). Es gibt keine Wiederherstellung, "PIN vergessen" löscht alle Daten. Grenze: Eine kurze PIN schützt vor neugierigen Blicken, aber nur begrenzt, wenn jemand die App-Dateien eines gerooteten Geräts kopiert. Besser ist eine PIN mit 8 oder mehr Ziffern. Die Ansicht im App-Umschalter wird nicht abgedunkelt.
- **Zusammenfassung fürs Handy:** "Plan prüfen" ist in der App eine eigene, übersichtliche Seite: oben "PDF erstellen" und "Als Grafik ansehen" mit Status ("Bereit" oder "n offen"), darunter das Setup als Kacheln, offene Punkte als antippbare Liste, nächste Schritte (Jahrescheck, Backup) und aufklappbare Karten (Wohin mit dem PDF, Sicherheitstipps). Weiter/Zurück sitzt fest unten.
- **Diagramme fürs Handy:** Das Gesamtdiagramm wird auf schmalen Bildschirmen (unter 760 px) als eine Spalte aufgebaut, die Verbindungen laufen als farbige Linien (Farbe des Seeds) am linken Rand. Die Diagrammkarten sind ein Baum mit durchgehender Linie, die Zuordnung (Backup, Auf Gerät, Schlüssel) steht über jeder Karte. Auf großen Bildschirmen und im Druck bleibt das Layout wie bisher (gleicher Code in Web und App).
- **Anzeige von Sonderzeichen:** Die zentrale Funktion esc() in index.html lässt vorhandene HTML-Kürzel wie &szlig; stehen, damit Texte nicht doppelt maskiert angezeigt werden. Geprüft für alle 22 Wizard-Schritte, die Zusammenfassung, die Tipps und das PDF auf Deutsch und Englisch.
- **Drucken/PDF:** Der Android-Druckdialog meldet kein "afterprint". Die App löst es selbst aus (beim Zurückkehren in die App), damit der Druckmodus der Grafik nicht hängen bleibt. Die Grafik wird im Querformat gedruckt. Vor dem ersten Druck erklärt ein Hinweis, wie man "Als PDF speichern" wählt (abschaltbar).
- **PIN zurücksetzen:** Mit der alten PIN eine neue festlegen, die Daten bleiben erhalten. Vor jeder neuen PIN erscheint eine Warnung mit Pflicht-Haken: Die PIN lässt sich nicht wiederherstellen, sie muss sicher aufgeschrieben werden. Ohne die alte PIN bleibt nur "Alle Daten löschen".
- **Backup für Passwort-Manager (z. B. Bitwarden):** "Plan speichern" in der Zusammenfassung oder im Plan-Menü ("Backup sichern") bietet "In Passwort-Manager sichern". Die App kopiert einen kompakten Text (gzip + Base64, Kopfzeile mit Planname) in die Zwischenablage, der als Sichere Notiz eingefügt wird (typisch ca. 1000 Zeichen, Bitwarden-Notizlimit etwa 10.000). Wiederherstellen: Pläne > "Plan aus Backup wiederherstellen" > Text einfügen oder Datei wählen. Alternativ "Als Datei teilen" (optional mit Passwort, AES-256).
- **Handy-Kalender:** "In Handy-Kalender eintragen" öffnet die Kalender-App (Android: Intent, iOS: Ereignis-Dialog) mit fertigem, jährlich wiederkehrendem Termin und der Checkliste in der Beschreibung. Der Nutzer tippt nur auf Speichern. Ohne Kalender-App gibt es die .ics-Datei als Ausweichweg. Plugin: `plugins/native-print` (`NativeCalendar`).
- **Checkliste anpassen:** In der Checkliste mit "Anpassen" Punkte entfernen (wiederherstellbar) oder eigene hinzufügen. Die Änderungen gehören zum Plan (`state.checkCustom`) und gelten auch für PDF-Seite, Kalendereintrag und den Kalender-Tab.
- **Checkliste:** Wird aus dem Plan erzeugt (Hardware-Wallets, Seeds/Backups, Software-Wallets, Börsen, Passwortmanager, Multisig, Liana, Timelock, digitale Kopie). Abhaken wird auf dem Gerät gespeichert, "Check abschließen" setzt zurück. Die Checkliste landet auch als eigene Seite mit Jahresprotokoll im PDF.
- **Erstgespräch:** Karte "Kostenloses Erstgespräch" auf Startseite und Zusammenfassung, Link auf `clavastack.com/security-talk` (in der App mit `?utm_source=inheritance-planner-app`). **Bitte den Text prüfen**, er verspricht, dass das Erstgespräch den Plan gemeinsam in der App durchgeht.
- **Native Anpassungen:** PDF über den System-Druckdialog ("Als PDF sichern"), Plan-Datei über das Teilen-Menü, Zurück-Taste, Entwurf wird lokal gespeichert (Löschen-Button auf der Startseite), Schriften lokal gebündelt (kein Google-Fonts-Abruf), kein Service Worker.

## Entwickeln

```bash
npm install
npm run assets      # Logo und Icons neu erzeugen (nur nach Logo-Änderung)
npm run sync        # www/ bauen und in android/ios kopieren
npm run android     # öffnet Android Studio
npm run ios         # öffnet Xcode (nur auf dem Mac)
```

Ohne eigenes Android SDK oder Mac: GitHub Actions, Workflow **App (Android und iOS)** (manuell starten). Er baut ein Debug-APK zum Testen und prüft, dass das iOS-Projekt kompiliert.

## Android: Google Play

Voraussetzung: Entwicklerkonto bei Google Play Console (einmalig 25 USD, Identitätsprüfung). Für neue private Konten verlangt Google vor dem Produktiv-Release einen geschlossenen Test mit mehreren Testern über 14 Tage (aktuelle Mindestzahl in der Play Console prüfen).

1. **Upload-Schlüssel erzeugen** (einmal, sicher und mehrfach sichern, ohne ihn gibt es keine Updates):
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
2. **Signieren:** Datei `android/keystore.properties` anlegen (steht in `.gitignore`):
   ```
   storeFile=../release.keystore
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
3. **Bundle bauen:** `cd android && ./gradlew bundleRelease`, Ergebnis: `android/app/build/outputs/bundle/release/app-release.aab`. Alternativ in GitHub die Secrets `ANDROID_KEYSTORE_B64` (Base64 der Keystore-Datei), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` setzen, dann liefert der Workflow das AAB.
4. In der Play Console: App erstellen, AAB in einen internen/geschlossenen Test hochladen, Store-Eintrag und Fragebögen ausfüllen (Texte unten), Produktion beantragen.
5. Bei jedem Update `versionCode` in `android/app/build.gradle` erhöhen.

## iOS: App Store

Voraussetzung: Apple Developer Program (99 USD pro Jahr) und ein Mac mit Xcode, oder ein Cloud-Build-Dienst (z. B. Codemagic).

1. `npm run ios`, in Xcode Target **App** wählen, unter *Signing & Capabilities* das Team setzen.
2. In App Store Connect App mit der Bundle-ID `com.clavastack.inheritanceplanner` anlegen.
3. Xcode: *Product > Archive > Distribute App > App Store Connect*. Danach über TestFlight testen und zur Prüfung einreichen.
4. Bei jedem Update `CURRENT_PROJECT_VERSION` erhöhen.
5. Export-Compliance ist mit `ITSAppUsesNonExemptEncryption = false` vorbelegt (nur Standard-Verschlüsselung des Betriebssystems, AES-GCM über Web Crypto). Bitte bei der ersten Einreichung die Fragen von Apple bestätigen.

## Was ich nicht testen konnte

Auf dem Entwicklungsrechner gibt es kein Android SDK, kein JDK 21 und keinen Mac. Deshalb sind diese Teile **nicht auf einem echten Gerät geprüft**:

- Kompilieren von `android/` und `ios/` (Workflow **App (Android und iOS)** übernimmt das).
- **PDF-Druck:** Das kleine lokale Plugin `plugins/native-print` öffnet den System-Druckdialog. Android nutzt `createPrintDocumentAdapter`, iOS `viewPrintFormatter`. Bitte auf beiden Systemen ein langes PDF (viele Seiten, Diagramme) prüfen. Falls iOS Seiten abschneidet, ist die Alternative, das PDF serverlos mit `WKWebView.createPDF` zu erzeugen.
- Benachrichtigungen (Android 13+ fragt zur Laufzeit nach der Erlaubnis; ohne Erlaubnis bleibt der Kalendereintrag).
- Sichere Bereiche (Notch, Statusleiste), Tastatur, Zurück-Taste.

Die Logik (Checkliste, Termine, Fälligkeit, Teilen, Entwurf) wurde im Browser gegen eine nachgebaute Capacitor-Schnittstelle getestet.

## Store-Texte

**Name:** Bitcoin Inheritance Planner

**Kurzbeschreibung (80 Zeichen, Play):** Bitcoin-Nachlassplan als PDF erstellen und jährlich prüfen. Ohne Seeds.

**Untertitel (30 Zeichen, iOS):** Nachlassplan und Jahrescheck

**Langbeschreibung (DE):**
Mit dem Bitcoin Inheritance Planner erstellst du Schritt für Schritt einen verständlichen Vererbungsplan für dein Bitcoin-Setup. Am Ende erhältst du ein gut lesbares PDF, das deine Erben ohne Vorwissen durch die Wiederherstellung führt.

- Geführter Assistent in übersichtlichen Boxen: Hardware-Wallets, Seeds und Backups, Software-Wallets, Börsen, Passwortmanager, Multisig, Liana, Timelock Recovery, Vertrauenspersonen
- Keine Geheimnisse in der App: Seed-Phrasen, PINs und Passphrasen trägst du nur handschriftlich in das ausgedruckte PDF ein
- Grafische Übersicht deiner Seeds, Wallets und Backups
- Jahrescheck: Lege einen festen Termin fest, die App erinnert dich einmal im Jahr und gibt dir eine Checkliste passend zu deinem Plan, auch als Seite im PDF
- Plan verschlüsselt speichern (AES-256) und später weiterbearbeiten
- Deutsch und Englisch, funktioniert vollständig offline
- Kostenloses Erstgespräch mit ClavaStack, in dem wir deinen Plan gemeinsam durchgehen

Open Source, entwickelt von ClavaStack.

**Long description (EN):**
Build a clear inheritance plan for your Bitcoin setup, step by step, and get a readable PDF that guides your heirs through recovery without prior knowledge.

- Guided wizard in clear boxes: hardware wallets, seeds and backups, software wallets, exchanges, password manager, multisig, Liana, timelock recovery, trusted contacts
- No secrets in the app: you write seed phrases, PINs and passphrases by hand into the printed PDF
- Visual overview of your seeds, wallets and backups
- Yearly check: pick a fixed date, the app reminds you once a year and gives you a checklist tailored to your plan, also included as a page in the PDF
- Save your plan encrypted (AES-256) and continue later
- English and German, works fully offline
- Free first consultation with ClavaStack where we go through your plan together

Open source, built by ClavaStack.

**Schlüsselwörter (iOS, 100 Zeichen):** bitcoin,erbe,nachlass,vererben,inheritance,seed,wallet,hardware wallet,checkliste,krypto

**Kategorie:** Finanzen (Play), Finanzen oder Produktivität (iOS)

**Screenshots (selbst erstellen):** Play mindestens 2 Handy-Screenshots (z. B. 1080x1920), iOS 6,9 Zoll (1320x2868) und 6,5 Zoll. Empfohlene Motive: Start, eine Wizard-Box, Jahrescheck-Termin, Checkliste, Diagramm, PDF-Vorschau. Feature-Grafik Play: 1024x500.

## Datenschutz-Angaben

Die App sammelt keine Daten und hat keine Konten, Werbung oder Analyse. Eingaben bleiben auf dem Gerät. Der einzige Netzkontakt ist das Öffnen externer Links (z. B. Erstgespräch buchen) im System-Browser.

- **Play Data safety:** "Keine Daten erhoben", "Keine Daten geteilt". Verschlüsselung bei der Übertragung ist nicht relevant, Löschung erfolgt über Deinstallation beziehungsweise den Button "Entwurf löschen".
- **Apple App Privacy:** "Data Not Collected".
- **Datenschutzerklärung:** In beiden Stores ist eine URL Pflicht. Unten steht ein Entwurf für `clavastack.com/privacy-planner`. Bitte rechtlich prüfen lassen.

**Entwurf Datenschutzerklärung (Bitcoin Inheritance Planner):**
Die App Bitcoin Inheritance Planner verarbeitet alle Eingaben ausschließlich lokal auf deinem Gerät. Wir erheben, speichern oder übermitteln keine personenbezogenen Daten und setzen keine Tracking- oder Analysedienste ein. Seed-Phrasen, PINs und Passphrasen werden nicht abgefragt. Der Entwurf deines Plans, die Checkliste und der Termin des Jahrescheck werden im privaten App-Speicher deines Geräts abgelegt und von Cloud-Backups ausgeschlossen. Du kannst sie jederzeit in der App löschen oder durch Deinstallation entfernen. Erinnerungen sind lokale Benachrichtigungen und enthalten keine Details zu deinem Plan. Plan-Dateien, die du speicherst, liegen dort, wo du sie ablegst. Wenn du externe Links öffnest, etwa zur Buchung des Erstgesprächs, gelten die Datenschutzhinweise der jeweiligen Seite (clavastack.com).

## Hinweise für die Store-Prüfung

- **Apple 4.2 (Mindestfunktionalität):** Die App ist mehr als eine Webseite im Rahmen: lokale Benachrichtigungen, Teilen-Menü, Druckdialog, Offline-Betrieb, lokaler Entwurf. Das in den Review-Hinweisen kurz erwähnen.
- **Krypto-Richtlinien:** Die App verwaltet kein Geld, keine Schlüssel und keinen Handel. In den Review-Hinweisen klar schreiben, dass es ein Dokumentations-Werkzeug ist.
- **Keine Finanzberatung:** Die App gibt Dokumentationshilfe, keine Anlage- oder Rechtsberatung. Das steht bereits im Planer, in der Store-Beschreibung bei Bedarf ergänzen.
- **Lizenz:** Der Planer steht unter CPAL-1.0. Das Wort "ClavaStack" bleibt als Link sichtbar (Kopfzeile). Auf dem Handy ist der Namenszusatz in der Kopfzeile ausgeblendet, das Logo ist verlinkt. Für das eigene Produkt ist das unkritisch.
