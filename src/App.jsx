import { useState } from "react";
import AddItem from "./components/AddItem";
import CollectionList from "./components/CollectionList";
import "./index.css";

export default function App() {
  const [tab, setTab] = useState("collection");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSaved = () => {
    setRefreshKey((k) => k + 1);
    setTab("collection");
  };

  return (
    <div className="app">
      <header className="app-header">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12" cy="5" r="3" fill="currentColor"/>
          <ellipse cx="12" cy="13" rx="5" ry="6" fill="currentColor"/>
          <ellipse cx="12" cy="13" rx="3" ry="4" fill="var(--bg)"/>
          <circle cx="12" cy="5" r="1.5" fill="var(--bg)"/>
        </svg>
        <h1>Nesbitt Barbie<span> College Fund</span></h1>
      </header>

      <nav className="tab-bar">
        <button
          className={tab === "collection" ? "active" : ""}
          onClick={() => setTab("collection")}
        >
          Collection
        </button>
        <button
          className={tab === "add" ? "active" : ""}
          onClick={() => setTab("add")}
        >
          + Add
        </button>
      </nav>

      <main className="content">
        {tab === "collection" && <CollectionList refreshKey={refreshKey} />}
        {tab === "add" && <AddItem onSaved={handleSaved} />}
      </main>
    </div>
  );
}
