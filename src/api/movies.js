const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function loadMovies() {
  const response = await fetch(`${API_BASE}/api/movies`);
  if (!response.ok) throw new Error("电影库加载失败");
  return response.json();
}

export async function loadMovie(movieId) {
  const response = await fetch(`${API_BASE}/api/movies/${encodeURIComponent(movieId)}`);
  if (!response.ok) throw new Error("电影详情加载失败");
  return response.json();
}

export async function rescanMovies() {
  const response = await fetch(`${API_BASE}/api/scan`, { method: "POST" });
  if (!response.ok) throw new Error("扫描失败，请检查 Docker 挂载路径");
  return response.json();
}
