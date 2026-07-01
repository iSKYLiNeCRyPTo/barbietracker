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
        <span style={{ fontSize: 22 }}>🪆</span>
        <h1>Barbie<span>Tracker</span></h1>
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
