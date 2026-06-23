# TODO – Nachlass-Tool (ClavaStack)

## Erledigt
- [x] Offline-Modus-Schalter (am Anfang) – schaltet sensible Eingaben frei.
- [x] BIP85 (globale Frage + pro Software-Wallet: Quell-Seed + Index).
- [x] Multisig (mehrere möglich, M-von-N, eigene Seeds zuordnen, externe Cosigner; im Offline-Modus
      Cosigner-xPub + Wallet-Descriptor eintippbar; Descriptor wird groß ins PDF gedruckt).

## Nice-to-have / später (QR-Codes & Automatik)
- [ ] **Wallet-Descriptor → QR-Code:** Descriptor automatisch parsen, Details ausfüllen und großen
  QR-Code mit Descriptor ins PDF setzen (Überschrift „Wallet Descriptor"). Kurzerklärung darunter.
- [ ] **Descriptor → Fingerprints extrahieren & zuordnen:** Aus dem hochgeladenen Wallet-Descriptor die
  enthaltenen Master-Key-Fingerprints (und Derivation Paths) auslesen und automatisch den passenden
  Seed-Phrasen/Wallets zuordnen (Matching über den Fingerprint, den der Nutzer pro Seed eingibt).
- [ ] **Watch-Only-QR aus xpub:** xpub eingeben → Watch-Only-QR erzeugen (z. B. für BlueWallet,
  zeigt Guthaben). Recherche QR-Format (xpub/zpub-Text-QR bzw. `wpkh([fp/84h/0h/0h]xpub…)`-Descriptor).
  Kleine QR-Lib inline einbetten. Kurzerklärung unter dem QR.

## Offline-Modus – noch ausbaubar
- Im Offline-Modus erscheinen Fingerprint / Derivation Path / xPub aktuell als **Linien** (handschriftlich).
  Optional: direkte Tastatureingabe dieser Felder + Anti-Phishing-Wörter pro Gerät/Smartcard,
  damit sie vorausgefüllt ins PDF gehen.
