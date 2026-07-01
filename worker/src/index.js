/**
 * BarbieTracker Worker
 *
 * Routes:
 *   GET  /upc/:code    UPC → title + images (UPCitemdb)
 *   GET  /search?q=    eBay keyword search → items with images
 *   GET  /price?q=     eBay sold scrape → { new, used } with IQR outlier removal
 *
 * Secrets:
 *   EBAY_CLIENT_ID
 *   EBAY_CLIENT_SECRET
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      if (url.pathname.startsWith("/upc/"))
        return await handleUpc(url.pathname.split("/upc/")[1]);
      if (url.pathname === "/search") {
        const q = url.searchParams.get("q");
        return q ? await handleSearch(q, env) : err("missing q");
      }
      if (url.pathname === "/price") {
        const q = url.searchParams.get("q");
        return q ? await handlePrice(q, env) : err("missing q");
      }
      return err("not found", 404);
    } catch (e) {
      return err(String(e), 500);
    }
  },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
function err(msg, status = 400) { return json({ error: msg }, status); }

// ── UPC lookup ────────────────────────────────────────────────────────────────

async function handleUpc(code) {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
  if (!res.ok) return err(`upc lookup failed: ${res.status}`, 502);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return json({ found: false, upc: code });
  return json({ found: true, upc: code, title: item.title, brand: item.brand, images: item.images ?? [] });
}

// ── eBay OAuth token (Client Credentials) ────────────────────────────────────

async function getEbayToken(env) {
  const creds = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
  const res   = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method:  "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// ── eBay Browse API search ────────────────────────────────────────────────────

async function handleSearch(q, env) {
  const token  = await getEbayToken(env);
  const params = new URLSearchParams({ q: `Barbie ${q}`, limit: "20", fieldgroups: "MATCHING_ITEMS" });
  const res    = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!res.ok) return err(`eBay search failed: ${res.status}`, 502);
  const data  = await res.json();
  const items = (data.itemSummaries ?? []).map((i) => ({
    id: i.itemId, title: i.title,
    image: i.image?.imageUrl ?? null,
    price: i.price ? parseFloat(i.price.value) : null,
    condition: i.condition ?? null,
    url: i.itemWebUrl ?? null,
  }));
  return json({ query: q, total: data.total ?? 0, items });
}


// ── eBay sold listings via Finding API ───────────────────────────────────────

async function handlePrice(q, env) {
  const [newItems, usedItems] = await Promise.all([
    fetchSoldItems(q, "1000", env),
    fetchSoldItems(q, "3000", env),
  ]);
  return json({
    query: q,
    new:  calcStats(newItems),
    used: calcStats(usedItems),
  });
}

async function fetchSoldItems(q, conditionId, env) {
  const params = new URLSearchParams({
    "OPERATION-NAME":       "findCompletedItems",
    "SERVICE-VERSION":      "1.0.0",
    "SECURITY-APPNAME":     env.EBAY_CLIENT_ID,
    "RESPONSE-DATA-FORMAT": "JSON",
    "keywords":             q,
    "itemFilter(0).name":   "SoldItemsOnly",
    "itemFilter(0).value":  "true",
    "itemFilter(1).name":   "Condition",
    "itemFilter(1).value":  conditionId,
    "paginationInput.entriesPerPage": "100",
    "sortOrder":            "EndTimeSoonest",
  });
  const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const listings = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
  return listings.map((i) => {
    const price = parseFloat(i.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? 0);
    const endTime = i.listingInfo?.[0]?.endTime?.[0];
    return { price: price || null, soldAt: endTime ? Date.parse(endTime) : null };
  }).filter((i) => i.price);
}

// ── IQR outlier removal ───────────────────────────────────────────────────────
//
// Drops prices outside Q1 - 1.5*IQR and Q3 + 1.5*IQR.
// Skipped when n < 4 — too few points to distinguish signal from noise.

function removeOutliers(prices) {
  if (prices.length < 4) return { clean: prices, removed: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const q1     = sorted[Math.floor(sorted.length * 0.25)];
  const q3     = sorted[Math.floor(sorted.length * 0.75)];
  const iqr    = q3 - q1;
  const lo     = q1 - 1.5 * iqr;
  const hi     = q3 + 1.5 * iqr;
  const clean  = sorted.filter((p) => p >= lo && p <= hi);
  return { clean, removed: sorted.length - clean.length };
}

function calcStats(items) {
  const cutoff  = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30  = items.filter((i) => i.soldAt && i.soldAt >= cutoff);
  const pool    = last30.length ? last30 : items;
  const raw     = pool.map((i) => i.price).filter(Boolean);

  if (!raw.length) {
    return { averagePrice: null, min: null, max: null, sampleSize: 0, outliersRemoved: 0, window: "none" };
  }

  const { clean, removed } = removeOutliers(raw);
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;

  return {
    averagePrice:    Math.round(avg * 100) / 100,
    min:             Math.min(...clean),
    max:             Math.max(...clean),
    sampleSize:      clean.length,
    outliersRemoved: removed,
    window:          last30.length ? "30d" : "fallback_all",
  };
}

