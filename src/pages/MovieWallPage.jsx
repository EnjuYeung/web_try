import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadMovieCategories, loadMovies, rescanMovieCategories, rescanMovies } from "../api/movies";
import { LoadingGrid } from "../components/LoadingGrid";
import { MovieCard } from "../components/MovieCard";
import { RescanButton } from "../components/RescanButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { compareMoviesByTitle } from "../utils/movies";

const CATEGORY_DISPLAY_NAMES = {
  动漫电影: "谁不爱呢",
  港台电影: "不要回来",
  国产电影: "天地不仁",
  欧美电影: "罗马和平",
  其他电影: "回首阑珊",
  日韩电影: "脱亚入欧"
};

export function MovieWallPage({
  onNavigate,
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

    return [...filtered].sort(compareMoviesByTitle);
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
                <span>{categoryDisplayName(categoryName)}</span>
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

function categoryDisplayName(categoryName) {
  return Object.hasOwn(CATEGORY_DISPLAY_NAMES, categoryName)
    ? CATEGORY_DISPLAY_NAMES[categoryName]
    : categoryName;
}

function shouldLetBrowserHandleClick(event) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}
