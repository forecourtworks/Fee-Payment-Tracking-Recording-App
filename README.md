# Fee Payment Recordings App

Offline-first web app for tracking school fees for **Bint Mariam** and **Rachel Wanjala** at **Rasual Al Amin Preparatory School**.

## Files

| File          | Purpose                                      |
|---------------|----------------------------------------------|
| `index.html`  | Main HTML structure                          |
| `styles.css`  | All styling                                  |
| `app.js`      | Application logic, data model, calculations  |
| `README.md`   | This file                                    |

## How to use

1. Keep all three files (`index.html`, `styles.css`, `app.js`) in the **same folder**.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
3. Works on phone and desktop. No installation required.
4. Data is stored locally in the browser (localStorage). No server needed.

> **Note:** The first time you open the app you need internet so the browser can load the two jsPDF libraries from CDN. After that the app works fully offline.

## Features

- Separate accounts for each child (Bint Mariam — Grade 3; Rachel Wanjala — Playgroup)
- Fees start at zero — enter term fees and arrears manually
- Per-term ledgers (Term 1 / 2 / 3) with arrears b/d, fee payable, payments, balance
- Balance carries to next term; Term 3 balance carries to next year
- Overpayment shown as balance 0 with credit reducing the next term
- Payment recording: amount, date, method, reference, confirmation text + optional receipt
- Edit & delete any existing payment
- Dashboard + per-child progress cards
- Clickable summary cards open a per-child breakdown
- PDF statement export
- Year selector supports historical and future years
- JSON backup / restore for multi-device sharing

## Children

| Child | School | Class |
|-------|--------|-------|
| Bint Mariam | Rasual Al Amin Preparatory School | Grade 3 |
| Rachel Wanjala | Rasual Al Amin Preparatory School | Playgroup |

## Multi-user / Multi-device

Because this is pure client-side, each browser/device keeps its own data.  
Use **Settings → Export JSON Backup** on one device and **Import JSON** on another to synchronise.

## Technical notes

- Receipts are stored as base64 inside localStorage — keep attached files reasonably small.
- Term dates follow the calendar you provided (Jan–Mar, May–Jul, Aug–Oct).
- You can edit any year’s fee structure inside Settings.
- All logic lives in `app.js` so future changes are straightforward.
