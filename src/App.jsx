import { useEffect, useState } from "react";
import { MovieDetailPage } from "./pages/MovieDetailPage";
import { MovieWallPage } from "./pages/MovieWallPage";
import { PosterLandingPage } from "./pages/PosterLandingPage";
import { getSystemTheme } from "./utils/theme";

export function App() {
  const [route, setRoute] = useState(() => getCurrentRoute());
  const [theme, setTheme] = useState(() => getSystemTheme());
  const [selectedCategories, setSelectedCategories] = useState([]);

  useEffect(() => {
    if (!Number.isInteger(window.history.state?.appIndex)) {
      window.history.replaceState({ ...(window.history.state || {}), appIndex: 0 }, "", currentUrl());
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setTheme(media.matches ? "dark" : "light");

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const handlePopState = () => setRoute(getCurrentRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path, options = {}) {
    const currentIndex = Number.isInteger(window.history.state?.appIndex) ? window.history.state.appIndex : 0;
    const state = { appIndex: options.replace ? currentIndex : currentIndex + 1 };
    if (options.replace) {
      window.history.replaceState(state, "", path);
    } else {
      window.history.pushState(state, "", path);
    }
    setRoute(getCurrentRoute());
  }

  function updateSearchQuery(value) {
    const searchQuery = value.trim();
    const nextPath = searchQuery ? `/library?q=${encodeURIComponent(searchQuery)}` : "/library";
    const hasSearchQuery =
      window.location.pathname === "/library" && new URLSearchParams(window.location.search).has("q");

    navigate(nextPath, { replace: hasSearchQuery });
  }

  function resetMovieWall() {
    setSelectedCategories([]);
    navigate("/library", { replace: true });
  }

  function goBackOrHome() {
    if (Number.isInteger(window.history.state?.appIndex) && window.history.state.appIndex > 0) {
      window.history.back();
      return;
    }

    navigate("/library", { replace: true });
  }

  if (route.name === "movie-detail") {
    return <MovieDetailPage movieId={route.movieId} onBack={goBackOrHome} />;
  }

  if (route.name === "poster-landing") {
    return <PosterLandingPage onEnter={() => navigate("/library")} />;
  }

  return (
    <MovieWallPage
      onNavigate={navigate}
      onReset={resetMovieWall}
      onSearchChange={updateSearchQuery}
      onSelectedCategoriesChange={setSelectedCategories}
      onThemeChange={setTheme}
      searchQuery={route.searchQuery}
      selectedCategories={selectedCategories}
      theme={theme}
    />
  );
}

function getCurrentRoute() {
  const movieMatch = window.location.pathname.match(/^\/movies\/([^/]+)$/);
  if (movieMatch) return { name: "movie-detail", movieId: decodeURIComponent(movieMatch[1]) };
  if (window.location.pathname === "/") return { name: "poster-landing" };
  return {
    name: "movie-wall",
    searchQuery: new URLSearchParams(window.location.search).get("q") || ""
  };
}

function currentUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
