# ClavaStack – Bitcoin-Nachlassplan-Tool

[![Live Demo](https://img.shields.io/badge/demo-clavastack.com-1e88e5)](https://clavastack.com/inheritance-planner)
[![Last commit](https://img.shields.io/github/last-commit/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/commits/master)
[![Open issues](https://img.shields.io/github/issues/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/issues)
[![Stars](https://img.shields.io/github/stars/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/stargazers)

> A single-file, self-contained browser tool that walks Bitcoin holders through a structured
> inheritance plan and turns it into a print-ready PDF — no server, no build step, no secrets ever
> typed into the page. German docs below; the app itself is fully bilingual (EN/DE).

![Screenshot of the ClavaStack Bitcoin Inheritance Plan tool](assets/screenshot-tool.png)

Ein eigenständiges, browserbasiertes Tool, mit dem man einen strukturierten **Bitcoin-Nachlassplan**
ausfüllt und als druckfertiges **PDF** (über die Browser-Druckfunktion) erzeugt. Funktionaler Klon des
Marc-Steiner-Nachlassplan-Tools, gestaltet im **Specter**-Branding mit **ClavaStack**-Logo.

## Nutzung

1. `index.html` im Browser öffnen (Chrome empfohlen) – kein Server, kein Build nötig.
2. Den Wizard ausfüllen. Nicht benötigte Abschnitte einfach deaktivieren (Toggle je Sektion).
3. Auf **„PDF erstellen"** klicken → der Druckdialog öffnet sich.
4. Als Ziel **„Als PDF speichern"** wählen. Funktioniert auch mit Druckeinstellung **„Ränder: Keine"**.

## Funktionen

- **Modularer Wizard** – nur ausgewählte Abschnitte/Geräte landen im PDF:
  - Allgemeine Informationen + bis zu 2 Vertrauenskontakte (Kontaktdaten und ein Hinweis zur
    Beziehung werden direkt im Wizard erfasst; leere Felder bleiben als Handschrift-Linie im PDF)
  - Hardware-Wallets (dynamisch, mit 24-Wort-Seed-Gitter je Gerät)
  - Software-Wallets (Computer & Smartphone)
  - Online-Exchanges (Börsen) inkl. 2FA-Gerät
  - Passwortmanager-App
  - Multisignatur-Wallet (mit Mitunterzeichnern)
- **Passwortgeschütztes Speichern & Laden** – die Wizard-Eingaben lassen sich am Ende als
  **verschlüsselte** Datei speichern und am Anfang wieder laden, um später weiterzuarbeiten.
  Die Verschlüsselung erfolgt mit **AES-256-GCM** (Schlüsselableitung per PBKDF2-SHA256 aus einem
  selbst gewählten Passwort, über die Web Crypto API). Das Passwort wird beim Speichern (mit
  Bestätigung) und beim Laden abgefragt; ein falsches Passwort schlägt sauber fehl. Ältere,
  unverschlüsselte Plandateien lassen sich weiterhin laden. *Ohne das Passwort gibt es keine
  Wiederherstellung – Datei und Passwort sicher/offline aufbewahren.*
- **Vordefinierte Geräte-/Börsenlisten** mit automatischem Ausfüllen der offiziellen URLs.
- **Automatische Schnellübersicht**-Tabelle aus allen erfassten Einträgen.
- **Druckoptimiertes PDF-Layout**: laufender Header (farbiges ClavaStack-Logo + URL) und Footer
  (Branding + Seitenzahl) auf jeder Seite, gleichmäßige Ränder auf allen vier Seiten, kein
  abgeschnittener/überlappender Inhalt ab Seite 2 (thead/tfoot-Spacer-Technik).

## Aufbau

| Datei | Zweck |
|-------|-------|
| `index.html` | Komplette App (HTML, CSS, Vanilla-JS) – self-contained, Logo als Base64 eingebettet |
| `sw.js` / `site.webmanifest` | Service Worker + PWA-Manifest für den Offline-Modus („Make available offline") |
| `assets/clavastack-logo.png` | ClavaStack-Logo (Quelle) |
| `.github/workflows/sync-to-clavastack.yml` | CI: spiegelt `index.html` bei jedem Push automatisch in die ClavaStack-Website |
| `.gitignore` | OS-/Editor-Artefakte |

Keine externen Abhängigkeiten außer dem Google-Fonts-Link (Montserrat).

## Live-Version

Die aktuelle `index.html` läuft live unter **[clavastack.com/inheritance-planner](https://clavastack.com/inheritance-planner)**
(wird bei jedem Push automatisch synchronisiert, siehe CI-Workflow oben).

## Sicherheitshinweis

Dieses Dokument enthält hochsensible Daten (PINs, Passwörter, Seed-Phrasen). Fülle es nur auf einem
vertrauenswürdigen Gerät aus, speichere/drucke es offline und bewahre Ausdrucke sicher auf.
