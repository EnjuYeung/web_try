import { useEffect, useState } from "react";
import { MovieDetailPage } from "./pages/MovieDetailPage";
import { MovieWallPage } from "./pages/MovieWallPage";
import { getSystemTheme } from "./utils/theme";

export function App() {
  const [route, setRoute] = useState(() => getCurrentRoute());
  const [theme, setTheme] = useState(() => getSystemTheme());

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
    const nextPath = searchQuery ? `/?q=${encodeURIComponent(searchQuery)}` : "/";
    const hasSearchQuery = window.location.pathname === "/" && new URLSearchParams(window.location.search).has("q");

    navigate(nextPath, { replace: hasSearchQuery });
  }

  function goBackOrHome() {
    if (Number.isInteger(window.history.state?.appIndex) && window.history.state.appIndex > 0) {
      window.history.back();
      return;
    }

    navigate("/", { replace: true });
  }

  if (route.name === "movie-detail") {
    return <MovieDetailPage movieId={route.movieId} onBack={goBackOrHome} />;
  }

  return <MovieWallPage onNavigate={navigate} onSearchChange={updateSearchQuery} onThemeChange={setTheme} searchQuery={route.searchQuery} theme={theme} />;
}

function getCurrentRoute() {
  const movieMatch = window.location.pathname.match(/^\/movies\/([^/]+)$/);
  if (movieMatch) return { name: "movie-detail", movieId: decodeURIComponent(movieMatch[1]) };
  return {
    name: "movie-wall",
    searchQuery: new URLSearchParams(window.location.search).get("q") || ""
  };
}

function currentUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
