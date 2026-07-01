import { useCallback, useState } from "react";
import { lookupUpc, searchProducts, fetchAveragePrice } from "../lib/api";
import { addItem } from "../lib/storage";
import BarcodeScanner from "./BarcodeScanner";

const MODE  = { SCAN: "scan", SEARCH: "search", MANUAL: "manual" };
const STAGE = { INPUT: "input", RESULTS: "results", CONFIRM: "confirm", DONE: "done" };

function PriceBox({ label, stats }) {
  if (!stats?.averagePrice) return (
    <div className="price-condition-block">
      <div className="price-condition-label">{label}</div>
      <div className="price-condition-none">No sales found</div>
    </div>
  );
  return (
    <div className="price-condition-block">
      <div className="price-condition-label">{label}</div>
      <div className="price-condition-avg">${stats.averagePrice.toFixed(2)}</div>
      <div className="price-condition-range">
        ${stats.min} – ${stats.max} · {stats.sampleSize} sales{stats.outliersRemoved > 0 && ` · ${stats.outliersRemoved} outlier${stats.outliersRemoved > 1 ? "s" : ""} removed`}
      </div>
    </div>
  );
}

export default function AddItem({ onSaved }) {
  const [mode,     setMode]     = useState(MODE.SCAN);
  const [stage,    setStage]    = useState(STAGE.INPUT);
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [price,    setPrice]    = useState(null); // { new: {...}, used: {...} }
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const reset = () => {
    setStage(STAGE.INPUT); setQuery(""); setResults([]);
    setSelected(null); setPrice(null); setError(null); setLoading(false);
  };
  const switchMode = (m) => { reset(); setMode(m); };

  // ── Scan ──
  const handleBarcode = useCallback(async (code) => {
    setLoading(true); setError(null); setStage(STAGE.CONFIRM);
    try {
      const data = await lookupUpc(code);
      setSelected({ title: data.found ? data.title : "", image: data.images?.[0] ?? null, upc: code });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // ── Search ──
  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null);
    try {
      const data = await searchProducts(query.trim());
      setResults(data.items ?? []);
      setStage(STAGE.RESULTS);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleSelectResult = (item) => {
    setSelected({ title: item.title, image: item.image });
    setStage(STAGE.CONFIRM);
  };

  // ── Manual ──
  const handleManualConfirm = () => {
    if (!query.trim()) return;
    setSelected({ title: query.trim(), image: null });
    setStage(STAGE.CONFIRM);
  };

  // ── Fetch price ──
  const handleFetchPrice = async () => {
    if (!selected?.title) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchAveragePrice(selected.title);
      setPrice(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Save ──
  const handleSave = async () => {
    setLoading(true);
    try {
      await addItem({
        title:      selected.title,
        image:      selected.image ?? null,
        upc:        selected.upc ?? null,
        priceNew:   price?.new  ?? null,
        priceUsed:  price?.used ?? null,
        pricedAt:   price ? Date.now() : null,
      });
      setStage(STAGE.DONE);
      onSaved?.();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="mode-switcher">
        {Object.values(MODE).map((m) => (
          <button key={m} className={mode === m ? "active" : ""} onClick={() => switchMode(m)}>
            {m === MODE.SCAN ? "📷 Scan" : m === MODE.SEARCH ? "🔍 Search" : "✏️ Manual"}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {/* SCAN */}
      {mode === MODE.SCAN && stage === STAGE.INPUT && (
        <div className="stack">
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Point the camera at a barcode on the box.</p>
          <BarcodeScanner active onDetected={handleBarcode} />
        </div>
      )}

      {/* SEARCH */}
      {mode === MODE.SEARCH && stage === STAGE.INPUT && (
        <div className="search-bar">
          <input className="input" placeholder='e.g. "Beach Barbie 1994"'
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={loading || !query.trim()}>
            {loading ? "…" : "Go"}
          </button>
        </div>
      )}

      {/* MANUAL */}
      {mode === MODE.MANUAL && stage === STAGE.INPUT && (
        <div className="stack">
          <input className="input" placeholder="Full doll name"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn-primary" onClick={handleManualConfirm} disabled={!query.trim()}>
            Continue
          </button>
        </div>
      )}

      {/* RESULTS */}
      {stage === STAGE.RESULTS && (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            {results.length} results — tap one to add
          </p>
          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <p>Nothing found. Try a different name or use Manual entry.</p>
            </div>
          ) : (
            <div className="results-grid">
              {results.map((item) => (
                <div key={item.id} className="result-card" onClick={() => handleSelectResult(item)}>
                  {item.image
                    ? <img src={item.image} alt={item.title} loading="lazy" />
                    : <div className="card-img-placeholder">🪆</div>}
                  <div className="card-body">
                    <div className="card-title">{item.title}</div>
                    {item.price && <div className="card-price">${item.price.toFixed(2)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" onClick={reset}>← Back</button>
        </div>
      )}

      {/* CONFIRM */}
      {stage === STAGE.CONFIRM && selected && (
        <div>
          <div className="confirm-panel">
            {selected.image && <img className="confirm-img" src={selected.image} alt={selected.title} />}
            <label>Name</label>
            <input className="input" value={selected.title}
              onChange={(e) => setSelected((s) => ({ ...s, title: e.target.value }))}
              placeholder="Doll name" />

            <div style={{ marginTop: 14 }}>
              {!price ? (
                <button className="btn btn-ghost" onClick={handleFetchPrice}
                  disabled={loading || !selected.title}>
                  {loading ? "Fetching prices…" : "Fetch new & used prices"}
                </button>
              ) : (
                <div className="price-split">
                  <PriceBox label="New / NRFB" stats={price.new}  />
                  <PriceBox label="Used"        stats={price.used} />
                </div>
              )}
            </div>
          </div>

          <div className="stack">
            <button className="btn btn-primary" onClick={handleSave} disabled={loading || !selected.title}>
              {loading ? "Saving…" : "Add to collection"}
            </button>
            <button className="btn btn-ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {/* DONE */}
      {stage === STAGE.DONE && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <p>Added to your collection!</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={reset}>
            Add another
          </button>
        </div>
      )}
    </div>
  );
}
