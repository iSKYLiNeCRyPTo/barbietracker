import { useCallback, useState } from "react";
import { addItem } from "../lib/storage";
import { lookupUpc, fetchAveragePrice } from "../lib/api";
import BarcodeScanner from "./BarcodeScanner";

const STAGE = {
  SCAN: "scan",
  CONFIRM: "confirm",
  SAVING: "saving",
  DONE: "done",
};

export default function AddToCollection({ onSaved }) {
  const [stage, setStage] = useState(STAGE.SCAN);
  const [matched, setMatched] = useState(null); // { upc, title, ... }
  const [titleOverride, setTitleOverride] = useState("");
  const [price, setPrice] = useState(null);
  const [error, setError] = useState(null);

  const handleDetected = useCallback(async (code) => {
    setError(null);
    setStage(STAGE.CONFIRM);
    try {
      const result = await lookupUpc(code);
      if (result.found) {
        setMatched(result);
        setTitleOverride(result.title);
      } else {
        setMatched({ upc: code, found: false });
        setTitleOverride("");
      }
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const handleFetchPrice = async () => {
    setError(null);
    try {
      const result = await fetchAveragePrice(titleOverride);
      setPrice(result);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSave = async () => {
    setStage(STAGE.SAVING);
    try {
      await addItem({
        upc: matched?.upc ?? null,
        title: titleOverride,
        averagePrice: price?.averagePrice ?? null,
        priceSampleSize: price?.sampleSize ?? 0,
        priceWindow: price?.usedWindow ?? null,
      });
      setStage(STAGE.DONE);
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setStage(STAGE.CONFIRM);
    }
  };

  const reset = () => {
    setStage(STAGE.SCAN);
    setMatched(null);
    setTitleOverride("");
    setPrice(null);
    setError(null);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {stage === STAGE.SCAN && (
        <>
          <h2>Scan a box</h2>
          <BarcodeScanner active onDetected={handleDetected} />
        </>
      )}

      {stage === STAGE.CONFIRM && (
        <>
          <h2>Confirm</h2>
          {matched && !matched.found && (
            <p>No UPC match found ({matched.upc}) - enter the name manually.</p>
          )}
          <input
            style={{ width: "100%", padding: 8, fontSize: 16 }}
            value={titleOverride}
            onChange={(e) => setTitleOverride(e.target.value)}
            placeholder="Doll name, e.g. 2023 Barbie Holiday Doll"
          />

          <button onClick={handleFetchPrice} disabled={!titleOverride} style={{ marginTop: 12 }}>
            Get 30-day avg price
          </button>

          {price && (
            <div style={{ marginTop: 12 }}>
              <p>
                Avg: <strong>${price.averagePrice ?? "n/a"}</strong> (
                {price.sampleSize} sales, {price.usedWindow})
              </p>
              {price.min != null && (
                <p>
                  Range: ${price.min} - ${price.max}
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={!titleOverride}>
              Save to collection
            </button>
            <button onClick={reset}>Rescan</button>
          </div>
        </>
      )}

      {stage === STAGE.SAVING && <p>Saving...</p>}

      {stage === STAGE.DONE && (
        <>
          <p>Added to your collection.</p>
          <button onClick={reset}>Scan another</button>
        </>
      )}
    </div>
  );
}
