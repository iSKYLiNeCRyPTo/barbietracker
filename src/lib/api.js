const BASE = import.meta.env.VITE_WORKER_URL;

export async function lookupUpc(code) {
  const res = await fetch(`${BASE}/upc/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`UPC lookup failed (${res.status})`);
  return res.json();
}

export async function searchProducts(query) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export async function fetchAveragePrice(query) {
  const res = await fetch(`${BASE}/price?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Price lookup failed (${res.status})`);
  return res.json();
}
