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
        return q ? await handleSearch(q) : err("missing q");
      }
      if (url.pathname === "/price") {
        const q = url.searchParams.get("q");
        return q ? await handlePrice(q) : err("missing q");
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

// ── eBay search page scrape (temporary, no API key needed) ───────────────────
// TODO: swap back to handleSearchApi() once eBay developer account is approved.

async function handleSearch(q) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`Barbie ${q}`)}&_sop=12&LH_BIN=1`;
  const UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return err(`eBay search failed: ${res.status}`, 502);

  const html  = await res.text();
  const items = parseSearchListings(html);
  return json({ query: q, total: items.length, items });
}

/* When the Browse API is approved, rename the above to handleSearch and
   uncomment + rename this to handleSearch instead:

async function handleSearchApi(q, env) {
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
*/

function parseSearchListings(html) {
  const items  = [];
  const blocks = html.split('<div class="s-item__info clearfix">').slice(1);

  for (const block of blocks) {
    const titleMatch = block.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/);
    const priceMatch = block.match(/<span class="s-item__price">[^$]*\$([\d,]+\.?\d*)/);
    const imgMatch   = block.match(/<img[^>]+src="(https:\/\/i\.ebayimg\.com[^"]+)"[^>]*>/);
    const urlMatch   = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"?]+)/);
    const idMatch    = urlMatch?.[1]?.match(/\/itm\/(\d+)/);

    const title = titleMatch?.[1]?.trim();
    if (!title || title === "Shop on eBay") continue;

    items.push({
      id:    idMatch?.[1] ?? Math.random().toString(36).slice(2),
      title,
      image: imgMatch?.[1]?.replace(/s-l\d+/, "s-l500") ?? null, // upscale thumb
      price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
      url:   urlMatch?.[1] ?? null,
    });

    if (items.length >= 20) break;
  }

  return items;
}

// ── eBay sold listings — new + used in parallel ───────────────────────────────

async function handlePrice(q) {
  const base = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`;
  const UA   = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

  const [newRes, usedRes] = await Promise.all([
    fetch(`${base}&LH_ItemCondition=1000`, { headers: { "User-Agent": UA } }),
    fetch(`${base}&LH_ItemCondition=3000`, { headers: { "User-Agent": UA } }),
  ]);

  const [newHtml, usedHtml] = await Promise.all([
    newRes.ok  ? newRes.text()  : Promise.resolve(""),
    usedRes.ok ? usedRes.text() : Promise.resolve(""),
  ]);

  return json({
    query: q,
    new:   calcStats(parseSoldListings(newHtml)),
    used:  calcStats(parseSoldListings(usedHtml)),
  });
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

// ── HTML parser ───────────────────────────────────────────────────────────────

function parseSoldListings(html) {
  const items  = [];
  const blocks = html.split('<div class="s-item__info clearfix">').slice(1);
  for (const block of blocks) {
    const priceMatch = block.match(/<span class="s-item__price">[^$]*\$([\d,]+\.\d{2})/);
    const dateMatch  = block.match(/Sold\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
    if (!isNaN(price)) items.push({ price, soldAt: dateMatch ? Date.parse(dateMatch[1]) : null });
  }
  return items;
}
