# Deribit transaction log dashboard (browser-only)

Static web app for crypto options students to upload a Deribit transaction log CSV, view a live analytics dashboard in-browser, and download a standalone `.html` snapshot of the dashboard.

**Live site:** [https://ryanleejc.github.io/deribit-pnl-dashboard/](https://ryanleejc.github.io/deribit-pnl-dashboard/)

## Run locally

```bash
cd "c:\Users\jian_\Desktop\BTC\Deribit PNL Dashboard\deribit-dashboard"
npm install
npm run dev
```

Then open the local URL printed by Vite and upload a Deribit transaction log `.csv`.

## Build for hosting

```bash
cd "c:\Users\jian_\Desktop\BTC\Deribit PNL Dashboard\deribit-dashboard"
npm run build
npm run preview
```

The static site output is in `dist/`. You can deploy it to any static host (e.g. Vercel / Netlify / GitHub Pages).

## Notes

- CSV parsing happens entirely in the browser; files are not uploaded to a server.
- The “Download HTML” button creates a self-contained snapshot you can open offline.
