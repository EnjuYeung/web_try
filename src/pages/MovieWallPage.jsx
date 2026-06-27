import { useEffect, useMemo, useState } from "react";
import { loadMovieCategories, loadMovies, rescanMovieCategories, rescanMovies } from "../api/movies";
import { LoadingGrid } from "../components/LoadingGrid";
import { MovieCard } from "../components/MovieCard";
import { RescanButton } from "../components/RescanButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { compareMoviesByTitle, flattenMovies } from "../utils/movies";

export function MovieWallPage({
  onNavigate,
  searchQuery = "",
  onSearchChange,
  selectedCategories = [],
  onSelectedCategoriesChange,
  theme,
  onThemeChange
}) {
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchQuery);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [scanCategoryOptions, setScanCategoryOptions] = useState([]);
  const [selectedScanCategories, setSelectedScanCategories] = useState([]);

  useEffect(() => {
    setError("");
    loadMovies()
      .then((result) => {
        setDatabase(result);
        setCategoryOptions((current) =>
          current.length > 0 ? current : (result.categories || []).map((category) => category.name)
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    loadMovieCategories()
      .then((result) => {
        if (result.categories?.length > 0) {
          setCategoryOptions(result.categories);
        }
      })
      .catch(() => {});
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
      setScanCategoryOptions(result.categories || []);
      setSelectedScanCategories([]);
    } catch (err) {
      setError(err.message);
      setCategoryPickerOpen(false);
    } finally {
      setCategoryLoading(false);
    }
  }

  async function rescanSelectedCategories() {
    if (selectedScanCategories.length === 0) return;

    setScanning(true);
    setError("");
    setCategoryPickerOpen(false);
    try {
      setDatabase(await rescanMovieCategories(selectedScanCategories));
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
    setSelectedScanCategories((current) =>
      current.includes(categoryName)
        ? current.filter((name) => name !== categoryName)
        : [...current, categoryName]
    );
  }

  const movies = useMemo(() => {
    const value = query.trim().toLowerCase();
    const source = flattenMovies(database).filter(
      (movie) => selectedCategories.length === 0 || selectedCategories.includes(movie.category)
    );
    const filtered = value
      ? source.filter((movie) =>
          [movie.title, movie.originalTitle, movie.year, movie.rating]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(value))
        )
      : source;

    return filtered.sort(compareMoviesByTitle);
  }, [database, query, selectedCategories]);

  function toggleFilterCategory(categoryName) {
    const nextCategories = selectedCategories.includes(categoryName)
      ? selectedCategories.filter((name) => name !== categoryName)
      : [...selectedCategories, categoryName];
    onSelectedCategoriesChange?.(nextCategories);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-panel">
          <div className="brand-row">
            <div className="brand">Juen&apos;s</div>
            <nav aria-label="电影分类筛选" className="category-filters">
              {categoryOptions.map((categoryName) => {
                const selected = selectedCategories.includes(categoryName);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "category-filter category-filter--active" : "category-filter"}
                    key={categoryName}
                    onClick={() => toggleFilterCategory(categoryName)}
                    type="button"
                  >
                    {categoryName}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="source-line">{loading ? 0 : movies.length} 部影片</div>
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
          categories={scanCategoryOptions}
          loading={categoryLoading}
          onClose={() => setCategoryPickerOpen(false)}
          onConfirm={rescanSelectedCategories}
          onToggle={toggleCategory}
          selectedCategories={selectedScanCategories}
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
