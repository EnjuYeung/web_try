import { useEffect, useMemo, useState } from "react";
import { loadMovies, rescanMovies } from "../api/movies";
import { LoadingGrid } from "../components/LoadingGrid";
import { MovieCard } from "../components/MovieCard";
import { RescanButton } from "../components/RescanButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { compareMoviesByTitle, flattenMovies, movieCount } from "../utils/movies";

export function MovieWallPage({ onNavigate, theme, onThemeChange }) {
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setError("");
    loadMovies()
      .then(setDatabase)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function rescan() {
    setScanning(true);
    setError("");
    try {
      setDatabase(await rescanMovies());
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function openMovie(event, movie) {
    if (shouldLetBrowserHandleClick(event)) return;
    event.preventDefault();
    onNavigate(`/movies/${movie.id}`);
  }

  const movies = useMemo(() => {
    const value = query.trim().toLowerCase();
    const source = flattenMovies(database);
    const filtered = value
      ? source.filter((movie) =>
          [movie.title, movie.originalTitle, movie.year, movie.rating]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(value))
        )
      : source;

    return [...filtered].sort(compareMoviesByTitle);
  }, [database, query]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Juen&apos;s</div>
          <div className="source-line">{movieCount(database)} 部影片</div>
        </div>
        <div className="toolbar">
          <input
            aria-label="搜索电影"
            className="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索片名、年份、评分"
            value={query}
          />
          <RescanButton disabled={scanning} onClick={rescan} />
          <ThemeToggle value={theme} onChange={onThemeChange} />
        </div>
      </header>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <LoadingGrid />
      ) : (
        <section aria-label="电影海报墙" className="poster-grid">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} onOpen={openMovie} />
          ))}
        </section>
      )}
    </main>
  );
}

function shouldLetBrowserHandleClick(event) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}
