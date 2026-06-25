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

export async function rescanMovies(options = {}) {
  const response = await fetch(withForce(`${API_BASE}/api/scan`, options.force), { method: "POST" });
  if (!response.ok) throw new Error("扫描失败，请检查 Docker 挂载路径");
  return response.json();
}

export async function rescanMovie(movieId, options = {}) {
  const response = await fetch(withForce(`${API_BASE}/api/movies/${encodeURIComponent(movieId)}/scan`, options.force), { method: "POST" });
  if (!response.ok) throw new Error("电影刷新失败，请检查 Docker 挂载路径");
  return response.json();
}

function withForce(url, force) {
  return force ? `${url}?force=true` : url;
}
