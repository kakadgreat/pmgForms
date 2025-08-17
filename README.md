# PMG Intake POC (Vite + React + TS)

A tiny, Netlify-ready proof-of-concept that collects patient intake data and generates **separate PDFs per form**—ready to upload to your EMR.

## Quick start

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs to `dist/` (default Netlify publish dir).

## What it does

- Mobile-first, simple stepper UI
- Captures data once, generates PDFs for:
  - Registration
  - Health History (condensed)
  - Financial Policy & Consent
  - Release of Info
  - HIPAA Privacy Acknowledgement
  - Patient Code of Conduct
- In-browser signature pad
- Exports a ZIP with all PDFs

## Deploy to Netlify

- Use the following settings:
  - **Build command:** `npm run build`
  - **Publish directory:** `dist`

Or add a `netlify.toml` like this repo has.
