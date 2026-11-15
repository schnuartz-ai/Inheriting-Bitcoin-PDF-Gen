# Bitcoin Inheritance Planner: mobile app and store launch

> All paths and commands in this file are relative to the `app/` folder. Structure and automatic builds: [README.md](README.md).

The app is a Capacitor wrapper around the existing planner. There is still only **one** codebase for the shared core (`index.html`, `diagram.js`), plus the app-only sources in `src/`. `www/` is built from them, `android/` and `ios/` are the native projects.

| | |
|---|---|
| App name | Bitcoin Inheritance Planner |
| Bundle ID / application ID | `com.clavastack.inheritanceplanner` |
| Version | set by CI from the run number (1.0.N) |
| Logo | `resources/logo.svg`, sources in `resources/`, generated with `npm run assets` |

To change name or ID: edit `capacitor.config.json` (name, ID), then `applicationId` and `namespace` in `android/app/build.gradle` and `PRODUCT_BUNDLE_IDENTIFIER` / `CFBundleDisplayName` in the Xcode project and `ios/App/App/Info.plist`. The ID cannot be changed after the first store upload.

## Features (in addition to the website planner)

- **App UI (`src/app-shell.js`, app only):** On first launch the user picks German or English and sees a short overview. A bottom bar is always visible: **Plans, Calendar, Settings**. "Plans" holds several locally stored plans (continue, view, rename, duplicate, delete, back up). The "Calendar" shows the yearly check dates of all plans, completed checks appear green. After the PDF the app asks whether to set up a yearly check. "Settings" contains language, notifications, introduction, first consultation and "Delete all data".
- **Mobile summary:** "Review plan" is a dedicated page in the app: "Create PDF" and "Show as graphic" on top with a status ("Ready" or "n open"), the setup as tiles, open items as a tappable list, next steps (yearly check, backup) and collapsible cards (where to keep the PDF, security tips). Next/Back sits fixed at the bottom.
- **Diagrams on phones (shared core):** On narrow screens (below 760 px) the full diagram is built as one column with colored lanes (the seed color) on the left edge. The diagram cards are a tree with one continuous line. On large screens and in print the layout is unchanged.
- **PIN lock (optional, Settings > Security):** 6 to 12 digits. All plans, the plan index and the dates are encrypted with AES-256-GCM. A random data key is protected by the PIN (PBKDF2-SHA256, 400,000 rounds), so the PIN can be changed without re-encrypting the data. The app locks after 30 seconds in the background, and after 5 wrong attempts waiting times apply (30 s, doubling up to 15 min). There is no recovery; "Forgot PIN" deletes all data. Limit: a short PIN protects against casual access but only to a limited degree if someone copies the app files from a rooted device. A PIN with 8 or more digits is better. The app switcher preview is not blurred.
- **Reset PIN:** Set a new PIN using the old one, the data is kept. Before every new PIN a warning with a mandatory checkbox appears: the PIN cannot be recovered and must be written down safely. Without the old PIN the only way out is "Delete all data".
- **Backup for a password manager (e.g. Bitwarden):** "Save plan" in the summary or "Back up" in the plan menu offers "Save to password manager". The app copies a compact text (gzip + Base64, header line with the plan name) to the clipboard that is pasted as a secure note (typically about 1,000 characters, the Bitwarden note limit is about 10,000). Restore: Plans > "Restore a plan from a backup" > paste text or pick a file. Alternatively "Share as file" (optionally with a password, AES-256).
- **Phone calendar:** "Add to phone calendar" opens the calendar app (Android: intent, iOS: event dialog) with a ready-made, yearly repeating event and the checklist in the description. The user only taps Save. Without a calendar app an .ics file is offered as a fallback. Plugin: `plugins/native-print` (`NativeCalendar`).
- **Edit the checklist:** In the checklist, "Edit" removes items (restorable) or adds own items. The changes belong to the plan (`state.checkCustom`) and also apply to the PDF page, the calendar event and the calendar tab.
- **Yearly check:** A new wizard step before the summary. The user picks a date and time. The app schedules local notifications for the next 5 years and tops them up on every start. A calendar event (.ics, yearly repeating, reminder one week before and on the day) is also available.
- **Checklist:** Generated from the plan (hardware wallets, seeds/backups, software wallets, exchanges, password manager, multisig, Liana, timelock, digital copy). Ticks are stored on the device, "Complete check" resets them. The checklist is also a separate page with a yearly log in the PDF.
- **First consultation:** A "Free first consultation" card on the start page and the summary, linking to `clavastack.com/security-talk` (with `?utm_source=inheritance-planner-app` in the app). **Please review the wording**, it promises that the consultation goes through the plan together in the app.
- **Printing/PDF:** The Android print dialog does not report "afterprint". The app triggers it itself when returning to the app, so the print mode of the graphic does not get stuck. The graphic prints in landscape. Before the first print a hint explains how to pick "Save as PDF" (can be turned off).
- **Native adjustments:** PDF through the system print dialog, plan file through the share sheet, back button, fonts bundled locally (no Google Fonts request), no service worker.

## Android: Google Play

Prerequisite: a Google Play Console developer account (one-time 25 USD, identity verification). For new personal accounts Google requires a closed test with several testers over 14 days before the production release (check the current minimum in the Play Console).

1. **Create an upload key** (once, back it up safely, without it there are no updates), see the README for the command.
2. **Sign:** create `android/keystore.properties` (it is git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
3. **Build the bundle:** `cd android && ./gradlew bundleRelease`, result: `android/app/build/outputs/bundle/release/app-release.aab`. Alternatively set the four GitHub secrets (see README) and let the workflow produce the AAB.
4. In the Play Console: create the app, upload the AAB to an internal or closed test, fill in the store listing and questionnaires (texts below), request production.
5. The version is set by CI (`-PappVersionCode`, `-PappVersionName`). For local builds the defaults in `android/app/build.gradle` apply.

## iOS: App Store

Prerequisite: Apple Developer Program (99 USD per year) and a Mac with Xcode, or a cloud build service (for example Codemagic).

1. `npm run ios`, select the target **App** in Xcode and set the team under *Signing & Capabilities*.
2. Create the app in App Store Connect with the bundle ID `com.clavastack.inheritanceplanner`.
3. Xcode: *Product > Archive > Distribute App > App Store Connect*. Then test via TestFlight and submit for review.
4. Increase `CURRENT_PROJECT_VERSION` for every update.
5. Export compliance is preset with `ITSAppUsesNonExemptEncryption = false` (only standard OS encryption, AES-GCM via Web Crypto). Please confirm Apple's questions at the first submission.

## What is not tested

Development was done without a Mac and mostly without a physical device. These parts are **not verified on real devices**:

- Compiling `ios/` (the CI compile check covers it).
- **PDF printing:** The small local plugin `plugins/native-print` opens the system print dialog. Android uses `createPrintDocumentAdapter`, iOS `viewPrintFormatter`. Please check a long PDF (many pages, diagrams) on both systems.
- Notifications (Android 13+ asks for permission at runtime; without permission the calendar entry remains).
- Safe areas (notch, status bar), keyboard, back button.

The logic (checklist, dates, due state, sharing, draft, PIN, backup) was tested in the browser against an imitation of the Capacitor bridge.

## Store text (English)

**Name:** Bitcoin Inheritance Planner

**Short description (80 characters, Play):** Create a Bitcoin inheritance plan as a PDF and check it yearly. No seeds.

**Subtitle (30 characters, iOS):** Inheritance plan and yearly check

**Long description:**
Build a clear inheritance plan for your Bitcoin setup, step by step, and get a readable PDF that guides your heirs through recovery without prior knowledge.

- Guided wizard in clear boxes: hardware wallets, seeds and backups, software wallets, exchanges, password manager, multisig, Liana, timelock recovery, trusted contacts
- No secrets in the app: you write seed phrases, PINs and passphrases by hand into the printed PDF
- Visual overview of your seeds, wallets and backups
- Yearly check: pick a fixed date, the app reminds you once a year and gives you a checklist tailored to your plan, also included as a page in the PDF
- Optional PIN lock with AES-256 encryption of everything on the device
- Back up your plan to a password manager such as Bitwarden
- English and German, works fully offline
- Free first consultation with ClavaStack where we go through your plan together

Open source, built by ClavaStack.

**Keywords (iOS, 100 characters):** bitcoin,inheritance,estate,seed,wallet,hardware wallet,checklist,crypto,legacy,heirs

**Category:** Finance (Play), Finance or Productivity (iOS)

**Screenshots (to be created):** Play needs at least 2 phone screenshots (for example 1080x1920), iOS needs 6.9 inch (1320x2868) and 6.5 inch. Suggested motifs: start, a wizard box, yearly check date, checklist, diagram, PDF preview. Play feature graphic: 1024x500.

## Privacy

The app collects no data and has no accounts, ads or analytics. Inputs stay on the device. The only network contact is opening external links (for example booking the consultation) in the system browser.

- **Play Data safety:** "No data collected", "No data shared". Deletion happens by uninstalling or through "Delete all data".
- **Apple App Privacy:** "Data Not Collected".
- **Privacy policy:** A URL is mandatory in both stores. Draft below, please have it reviewed legally.

**Draft privacy policy (Bitcoin Inheritance Planner):**
The Bitcoin Inheritance Planner app processes all inputs exclusively on your device. We do not collect, store or transmit personal data and do not use tracking or analytics services. Seed phrases, PINs and passphrases are never requested. Your plans, checklists and the yearly check date are stored in the private app storage of your device and are excluded from cloud backups. If you enable the PIN lock they are encrypted with your PIN. You can delete them at any time in the app or by uninstalling it. Reminders are local notifications and contain no details about your plan. Plan files that you save are stored where you put them. When you open external links, for example to book the consultation, the privacy notices of the respective site (clavastack.com) apply.

## Notes for store review

- **Apple 4.2 (minimum functionality):** The app is more than a website in a frame: local notifications, share sheet, print dialog, offline operation, local plans with PIN lock. Mention this briefly in the review notes.
- **Crypto policies:** The app manages no money, no keys and no trading. State clearly in the review notes that it is a documentation tool.
- **No financial advice:** The app helps with documentation and gives no investment or legal advice. This is already stated in the planner, add it to the store description if needed.
- **License:** The planner is under CPAL-1.0. The word "ClavaStack" stays visible as a link. On phones the name addition in the header is hidden and the logo is linked; the settings page links ClavaStack as well. For your own product this is uncritical.
