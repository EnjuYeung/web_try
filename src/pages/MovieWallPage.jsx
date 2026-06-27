import { useEffect, useMemo, useState } from "react";
import { loadMovieCategories, loadMovies, rescanMovieCategories, rescanMovies } from "../api/movies";
import { LoadingGrid } from "../components/LoadingGrid";
import { MovieCard } from "../components/MovieCard";
import { RescanButton } from "../components/RescanButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { compareMoviesByTitle, flattenMovies, movieCount } from "../utils/movies";

export function MovieWallPage({ onNavigate, searchQuery = "", onSearchChange, theme, onThemeChange }) {
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchQuery);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  useEffect(() => {
    setError("");
    loadMovies()
      .then(setDatabase)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  async function rescan(options = {}) {
    setScanning(true);
    setError("");
    try {
      setDatabase(await rescanMovies({ force: options.force }));
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function openCategoryPicker() {
    setCategoryPickerOpen(true);
    setCategoryLoading(true);
    setError("");
    try {
      const result = await loadMovieCategories();
      setCategoryOptions(result.categories || []);
      setSelectedCategories([]);
    } catch (err) {
      setError(err.message);
      setCategoryPickerOpen(false);
    } finally {
      setCategoryLoading(false);
    }
  }

  async function rescanSelectedCategories() {
    if (selectedCategories.length === 0) return;

    setScanning(true);
    setError("");
    setCategoryPickerOpen(false);
    try {
      setDatabase(await rescanMovieCategories(selectedCategories));
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

  function updateQuery(value) {
    setQuery(value);
    onSearchChange?.(value);
  }

  function toggleCategory(categoryName) {
    setSelectedCategories((current) =>
      current.includes(categoryName)
        ? current.filter((name) => name !== categoryName)
        : [...current, categoryName]
    );
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

    return filtered.sort(compareMoviesByTitle);
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
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="搜索片名、年份、评分"
            value={query}
          />
          <RescanButton
            confirmMessage="确认开始普通刷新？将重新扫描全部电影并读取旧电影的最新 NFO。"
            disabled={scanning}
            onClick={() => rescan()}
            onContextMenu={openCategoryPicker}
            onForceClick={() => rescan({ force: true })}
          />
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

      {categoryPickerOpen && (
        <CategoryPickerDialog
          categories={categoryOptions}
          loading={categoryLoading}
          onClose={() => setCategoryPickerOpen(false)}
          onConfirm={rescanSelectedCategories}
          onToggle={toggleCategory}
          selectedCategories={selectedCategories}
        />
      )}
    </main>
  );
}

function CategoryPickerDialog({ categories, loading, onClose, onConfirm, onToggle, selectedCategories }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-label="选择分类文件夹刷新" aria-modal="true" className="category-dialog" role="dialog">
        <div className="category-dialog-header">
          <h2>选择分类文件夹</h2>
          <button aria-label="关闭" className="dialog-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="category-dialog-body">
          {loading ? (
            <div className="category-dialog-empty">读取中</div>
          ) : categories.length === 0 ? (
            <div className="category-dialog-empty">未找到分类文件夹</div>
          ) : (
            categories.map((categoryName) => (
              <label className="category-option" key={categoryName}>
                <input
                  checked={selectedCategories.includes(categoryName)}
                  onChange={() => onToggle(categoryName)}
                  type="checkbox"
                />
                <span>{categoryName}</span>
              </label>
            ))
          )}
        </div>

        <div className="category-dialog-actions">
          <button className="dialog-button" onClick={onClose} type="button">
            取消
          </button>
          <button className="dialog-button dialog-button--primary" disabled={selectedCategories.length === 0 || loading} onClick={onConfirm} type="button">
            确认刷新
          </button>
        </div>
      </div>
    </div>
  );
}

function shouldLetBrowserHandleClick(event) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}
