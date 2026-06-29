import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadMovieCategories, loadMovies, rescanMovieCategories, rescanMovies } from "../api/movies";
import { CategoryPickerDialog } from "../components/CategoryPickerDialog";
import { LoadingGrid } from "../components/LoadingGrid";
import { MovieCard } from "../components/MovieCard";
import { RescanButton } from "../components/RescanButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { categoryDisplayName } from "../utils/categories";
import { compareMoviesByTitle } from "../utils/movies";

export function MovieWallPage({
  onNavigate,
  onReset,
  searchQuery = "",
  onSearchChange,
  selectedCategories = [],
  onSelectedCategoriesChange,
  theme,
  onThemeChange
}) {
  const gridRef = useRef(null);
  const [database, setDatabase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchQuery);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);

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

  function openCategoryPicker() {
    setError("");
    setCategoryPickerOpen(true);
  }

  const closeCategoryPicker = useCallback(() => {
    setCategoryPickerOpen(false);
  }, []);

  const handleCategoryPickerError = useCallback((err) => {
    setError(err.message);
  }, []);

  async function rescanSelectedCategories(categories) {
    if (categories.length === 0) return;

    setScanning(true);
    setError("");
    setCategoryPickerOpen(false);
    try {
      setDatabase(await rescanMovieCategories(categories));
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

  const movies = useMemo(() => {
    const value = query.trim().toLowerCase();
    const source = (database?.movies || []).filter(
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

  const gridLayout = usePosterGridLayout(gridRef, !loading);
  const rowCount = Math.ceil(movies.length / gridLayout.columns);
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    enabled: !loading && movies.length > 0,
    estimateSize: () => gridLayout.rowHeight,
    overscan: 3,
    scrollMargin: gridLayout.scrollMargin
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [gridLayout.rowHeight, rowVirtualizer]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand-row">
            <button className="brand" onClick={onReset} type="button">
              Juen&apos;s
            </button>
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
                    {categoryDisplayName(categoryName)}
                  </button>
                );
              })}
            </nav>
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
        </div>
        <div className="source-line">{loading ? 0 : movies.length} 部影片</div>
      </header>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <LoadingGrid />
      ) : (
        <section
          aria-label="电影海报墙"
          className="poster-grid poster-grid--virtual"
          ref={gridRef}
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * gridLayout.columns;
            const rowMovies = movies.slice(start, start + gridLayout.columns);

            return (
              <div
                className="poster-grid-row"
                key={virtualRow.key}
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.columns}, minmax(0, 1fr))`,
                  transform: `translateY(${virtualRow.start - gridLayout.scrollMargin}px)`
                }}
              >
                {rowMovies.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} onOpen={openMovie} />
                ))}
              </div>
            );
          })}
        </section>
      )}

      {categoryPickerOpen && (
        <CategoryPickerDialog
          onClose={closeCategoryPicker}
          onConfirm={rescanSelectedCategories}
          onError={handleCategoryPickerError}
        />
      )}
    </main>
  );
}

function usePosterGridLayout(gridRef, enabled) {
  const [layout, setLayout] = useState({ columns: 1, rowHeight: 196, scrollMargin: 0 });

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!enabled || !element) return undefined;

    function update() {
      const width = element.clientWidth;
      const posterWidth = Math.min(170, Math.max(120, window.innerWidth * 0.085));
      const gap = 16;
      const columns = Math.max(1, Math.floor((width + gap) / (posterWidth + gap)));
      const cardWidth = (width - gap * (columns - 1)) / columns;
      const scrollMargin = element.getBoundingClientRect().top + window.scrollY;
      const next = {
        columns,
        rowHeight: cardWidth * 1.5 + gap,
        scrollMargin
      };

      setLayout((current) =>
        current.columns === next.columns &&
        Math.abs(current.rowHeight - next.rowHeight) < 0.5 &&
        Math.abs(current.scrollMargin - next.scrollMargin) < 0.5
          ? current
          : next
      );
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled, gridRef]);

  return layout;
}

function shouldLetBrowserHandleClick(event) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}
