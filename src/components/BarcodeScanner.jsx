import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onDetected, active = true }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!active) return;
    const reader = new BrowserMultiFormatReader();
    let controls;
    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result) => { if (result) onDetected(result.getText()); }
      )
      .then((c) => { controls = c; })
      .catch((e) => setError(e.message));
    return () => controls?.stop();
  }, [active, onDetected]);

  return (
    <div className="scanner-wrap">
      <video ref={videoRef} muted playsInline />
      {error && <p className="error" style={{ padding: 12 }}>Camera error: {error}</p>}
    </div>
  );
}
