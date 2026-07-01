import { useEffect, useState } from "react";
import { getAllItems, deleteItem } from "../lib/storage";

export default function CollectionList({ refreshKey }) {
  const [items,  setItems]  = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => { getAllItems().then(setItems); }, [refreshKey]);

  const handleDelete = async (id) => {
    await deleteItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const filtered = filter.trim()
    ? items.filter((i) => i.title?.toLowerCase().includes(filter.toLowerCase()))
    : items;

  // Total value: prefer new price, fall back to used
  const total = items.reduce((sum, i) => {
    const p = i.priceNew?.averagePrice ?? i.priceUsed?.averagePrice ?? 0;
    return sum + p;
  }, 0);

  return (
    <div>
      <div className="collection-header">
        <h2>{items.length} dolls</h2>
        {total > 0 && <div className="total-badge">${total.toFixed(2)}</div>}
      </div>

      {items.length > 0 && (
        <div className="collection-search">
          <input className="input" placeholder="Search your collection…"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🪆</div>
          <p>No dolls yet. Tap Add to get started.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No results for "{filter}"</p>
        </div>
      ) : (
        <div className="collection-grid">
          {filtered.map((item) => (
            <div key={item.id} className="coll-card">
              {item.image
                ? <img src={item.image} alt={item.title} loading="lazy" />
                : <div className="coll-img-placeholder">🪆</div>}
              <button className="coll-delete" onClick={() => handleDelete(item.id)}>✕</button>
              <div className="coll-body">
                <div className="coll-title">{item.title}</div>
                <div className="coll-prices">
                  {item.priceNew?.averagePrice != null && (
                    <span className="coll-price-tag new">
                      New ${item.priceNew.averagePrice.toFixed(2)}
                    </span>
                  )}
                  {item.priceUsed?.averagePrice != null && (
                    <span className="coll-price-tag used">
                      Used ${item.priceUsed.averagePrice.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
