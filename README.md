# BarbieTracker

Scan barcodes, search by name, or enter manually — log your Barbie collection
with product images and 30-day eBay sold prices. Everything stored on-device
(IndexedDB). No account needed.

## Setup

### 1. Worker

```bash
cd worker
wrangler deploy
# then add your eBay keys:
wrangler secret put EBAY_CLIENT_ID
wrangler secret put EBAY_CLIENT_SECRET
```

Get your eBay keys at developer.ebay.com → My Apps → Production keys.

### 2. Frontend

```bash
cp .env.example .env
# set VITE_WORKER_URL to your deployed worker URL
npm install
npm run dev
```

### 3. Deploy frontend

Push to GitHub and connect to Cloudflare Pages as usual.
Set VITE_WORKER_URL as an environment variable in the Pages build settings.

## Add to home screen

**Do this before scanning many items.** Safari can evict IndexedDB data for
sites visited infrequently (7-day policy). Installed PWAs get permanent
storage. Share → Add to Home Screen.

## How it works

- **Scan** — camera reads a UPC barcode → UPCitemdb resolves name + image
- **Search** — eBay Browse API (free) searches by keyword, returns images
- **Manual** — type the name directly, optionally fetch price separately
- **Prices** — scraped from eBay sold/completed listings (30-day window)
- **Storage** — IndexedDB on device, no server, no account

## Known fragile points

- eBay sold-listings scraper: if prices come back null, eBay changed their
  HTML markup. Check parseSoldListings() in worker/src/index.js.
- UPCitemdb free tier: 100 req/day. Fine for personal use.
- Vintage Barbies (pre-1980s) often have no UPC — use Search or Manual.
