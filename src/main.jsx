import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function App() {
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadMovies() {
    setError("");
    const response = await fetch(`${API_BASE}/api/movies`);
    if (!response.ok) throw new Error("电影库加载失败");
    setDatabase(await response.json());
  }

  useEffect(() => {
    loadMovies()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function rescan() {
    setScanning(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/scan`, { method: "POST" });
      if (!response.ok) throw new Error("扫描失败，请检查 Docker 挂载路径");
      setDatabase(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  const categories = useMemo(() => {
    const value = query.trim().toLowerCase();
    const source = database?.categories || [];
    if (!value) return source;

    return source
      .map((category) => ({
        ...category,
        movies: category.movies.filter((movie) => {
          return [movie.title, movie.originalTitle, movie.year, movie.rating]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(value));
        })
      }))
      .filter((category) => category.movies.length > 0);
  }, [database, query]);

  const featured = categories.flatMap((category) => category.movies.slice(0, 1)).slice(0, 5);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">NAS Movie Wall</div>
          <div className="source-line">
            {database?.source === "scan" ? "NAS 电影库" : "模拟数据库"} · {movieCount(database)} 部影片
          </div>
        </div>
        <div className="toolbar">
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索片名、年份、评分"
            aria-label="搜索电影"
          />
          <button className="scan-button" onClick={rescan} disabled={scanning}>
            {scanning ? "扫描中" : "重新扫描"}
          </button>
        </div>
      </header>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <LoadingRows />
      ) : (
        <>
          <FeaturedStrip movies={featured} />
          <section className="catalog">
            {categories.map((category) => (
              <MovieRow key={category.id || category.name} category={category} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function FeaturedStrip({ movies }) {
  if (movies.length === 0) return null;

  return (
    <section className="featured-strip" aria-label="精选影片">
      {movies.map((movie) => (
        <article key={movie.id} className="featured-card">
          <img src={movie.posterUrl} alt={movie.title} />
          <div className="featured-copy">
            <h1>{movie.title}</h1>
            <div className="meta">
              <span>{movie.year || "年份未知"}</span>
              <span>{movie.rating ? `★ ${movie.rating}` : "暂无评分"}</span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function MovieRow({ category }) {
  return (
    <section className="movie-section">
      <div className="section-heading">
        <h2>{category.name}</h2>
        <span>{category.movies.length}</span>
      </div>
      <div className="poster-row">
        {category.movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}

function MovieCard({ movie }) {
  return (
    <article className="movie-card" title={movie.title}>
      <div className="poster-frame">
        <img src={movie.posterUrl} alt={movie.title} loading="lazy" />
        <div className="poster-overlay">
          <div className="rating">{movie.rating ? `★ ${movie.rating}` : "暂无评分"}</div>
          <div className="year">{movie.year || "未知年份"}</div>
        </div>
      </div>
      <h3>{movie.title}</h3>
      <div className="card-meta">
        <span>{movie.year || "未知"}</span>
        <span>{movie.rating ? `★ ${movie.rating}` : "N/A"}</span>
      </div>
    </article>
  );
}

function LoadingRows() {
  return (
    <div className="loading-block">
      {Array.from({ length: 3 }).map((_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: 8 }).map((__, card) => (
            <div className="skeleton-card" key={card} />
          ))}
        </div>
      ))}
    </div>
  );
}

function movieCount(database) {
  return (database?.categories || []).reduce((total, category) => total + category.movies.length, 0);
}

createRoot(document.getElementById("root")).render(<App />);
