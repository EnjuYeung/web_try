import { useEffect, useState } from "react";
import { MovieDetailPage } from "./pages/MovieDetailPage";
import { MovieWallPage } from "./pages/MovieWallPage";
import { getSystemTheme } from "./utils/theme";

export function App() {
  const [route, setRoute] = useState(() => getCurrentRoute());
  const [theme, setTheme] = useState(() => getSystemTheme());

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

  function navigate(path) {
    window.history.pushState(null, "", path);
    setRoute(getCurrentRoute());
  }

  if (route.name === "movie-detail") {
    return <MovieDetailPage movieId={route.movieId} onNavigate={navigate} />;
  }

  return <MovieWallPage onNavigate={navigate} onThemeChange={setTheme} theme={theme} />;
}

function getCurrentRoute() {
  const movieMatch = window.location.pathname.match(/^\/movies\/([^/]+)$/);
  if (movieMatch) return { name: "movie-detail", movieId: decodeURIComponent(movieMatch[1]) };
  return { name: "movie-wall" };
}
