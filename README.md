# ClavaStack – Bitcoin Inheritance Plan Tool

[![Live Demo](https://img.shields.io/badge/demo-clavastack.com-1e88e5)](https://clavastack.com/inheritance-planner)
[![License](https://img.shields.io/github/license/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/commits/master)
[![Open issues](https://img.shields.io/github/issues/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/issues)
[![Stars](https://img.shields.io/github/stars/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen)](https://github.com/schnuartz-ai/Inheriting-Bitcoin-PDF-Gen/stargazers)

A local-first browser tool that walks Bitcoin holders through a structured
**inheritance plan** and turns it into a print-ready **PDF** (via the browser's print function).
A functional clone of the Marc Steiner inheritance-plan tool, styled with **Specter** branding and
the **ClavaStack** logo. The app itself is fully bilingual (EN/DE, switchable in the header).

![Screenshot of the ClavaStack Bitcoin Inheritance Plan tool](assets/screenshot-tool.png)

## Usage

1. Open `index.html` in a browser (Chrome recommended) – no build step required. Keep `diagram.js` and `diagram.css` beside it.
2. Fill out the wizard. Sections/devices you don't need can simply be toggled off.
3. Click **"Create PDF"** → the browser's print dialog opens.
4. Choose **"Save as PDF"** as the destination. Also works with the **"Margins: None"** print
   setting.

## Features

- **Modular wizard** – only the sections/devices you select end up in the PDF:
  - General information + up to 2 trusted contacts (contact details and a relationship note are
    captured directly in the wizard; empty fields remain a blank handwriting line in the PDF)
  - Hardware wallets (dynamic, with a 24-word seed grid per device)
  - Software wallets (computer & smartphone)
  - Online exchanges, incl. 2FA device
  - Password manager app
  - Multisig wallet (with co-signers)
- **Password-protected save & load** – wizard input can be saved as an **encrypted** file at the
  end and reloaded later to continue. Encryption uses **AES-256-GCM** (key derivation via
  PBKDF2-SHA256 from a self-chosen password, through the Web Crypto API). The password is
  requested on save (with confirmation) and on load; a wrong password fails cleanly. Older,
  unencrypted plan files can still be loaded. *Without the password there is no recovery – keep the
  file and password safe/offline.*
- **Predefined device/exchange lists** with automatic filling of the official URLs.
- **Automatic quick-overview table** built from all entries.
- **Two visual overviews** at the end of the wizard: a connected full diagram with a distinct color for each seed and its derived paths, plus individual seed/wallet diagram cards with local wallet and service icons. Both print on fixed A4 landscape sheets with 15 mm internal margins; diagram cards are grouped on pages without cutting a card, while the full diagram offsets parallel connections and leaves clear bands at page breaks. Neither view asks for or displays seed words, PINs, passphrases, or storage locations.
- **Print-optimized PDF layout**: a running header (colored ClavaStack logo + URL) and footer
  (branding + page number) on every page, even margins on all four sides, no
  cut-off/overlapping content from page 2 onward (thead/tfoot spacer technique).

## What the PDF looks like

The generated document never contains secrets – seed phrases, PINs and passwords stay as blank
handwriting lines, filled in by hand only after printing.

![Sample page of the generated PDF – general info and trusted contacts](assets/screenshot-pdf-1.png)
![Sample page of the generated PDF – hardware device section](assets/screenshot-pdf-2.png)

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Wizard and standard PDF plan (HTML, CSS, vanilla JS) |
| `diagram.js` / `diagram.css` | Automatically generated diagram views and print styles |
| `assets/diagram/` | Local backup, smartcard and seed illustrations used by the diagrams |
| `assets/bitcoin-icons/` | Local generic diagram icons from Bitcoin Design |
| `sw.js` / `site.webmanifest` | Service worker + PWA manifest for offline mode ("Make available offline") |
| `assets/clavastack-logo.png` | ClavaStack logo (source) |
| `.github/workflows/sync-to-clavastack.yml` | CI: mirrors the planner files to the ClavaStack website on every push |
| `.gitignore` | OS/editor artifacts |

No external dependencies besides the Google Fonts link (Montserrat).

## Live version

The current `index.html` runs live at **[clavastack.com/inheritance-planner](https://clavastack.com/inheritance-planner)**
(auto-synced on every push, see the CI workflow above).

## Security notice

This document contains highly sensitive data (PINs, passwords, seed phrases) once filled in by
hand. Only fill it out on a trusted device, save/print it offline, and store printouts securely.

## License

Licensed under the [Common Public Attribution License 1.0 (CPAL-1.0)](LICENSE). Unlike a
plain MIT/Apache license, CPAL contractually requires visible attribution: if you embed,
redistribute, or build on this tool — including on your own website — [Exhibit B of the
LICENSE](LICENSE) requires the single word **"ClavaStack"**, prominently and legibly
displayed in the user interface, as an active hyperlink to https://clavastack.com. No logo
or additional wording is required — but it must be there, not buried in a source file or
credits page.

Generic diagram symbols use selected [Bitcoin Icons](https://github.com/BitcoinDesign/Bitcoin-Icons)
under the MIT license; the required notice is in
[`assets/bitcoin-icons/LICENSE-MIT`](assets/bitcoin-icons/LICENSE-MIT). Wallet and service
logos continue to use the planner's existing local images.
