import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.js";
import { buildPosterIndex, loadMovieDatabase, scanMovies } from "./scanner.js";
import { sendArtwork, sendPoster } from "./poster.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
loadEnvFile(path.join(rootDir, ".env"));

const app = express();

const PORT = Number(process.env.PORT || 3000);
const MEDIA_ROOT = process.env.MEDIA_ROOT || "/media/movies";
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, "data");
const mockDbPath = path.join(__dirname, "data", "mockMovies.json");
const cachePath = path.join(DATA_ROOT, "scan-cache.json");
const tmdbCachePath = path.join(DATA_ROOT, "tmdb-cache.json");

let database = await loadMovieDatabase({ mediaRoot: MEDIA_ROOT, mockDbPath, cachePath, tmdbCachePath });
let posterIndex = buildPosterIndex(database);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, source: database.source, updatedAt: database.updatedAt });
});

app.get("/api/movies", (_req, res) => {
  res.json(database);
});

app.get("/api/movies/:id", (req, res) => {
  const movie = posterIndex.get(req.params.id);
  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  res.json(movie);
});

app.post("/api/scan", async (_req, res) => {
  database = await scanMovies(MEDIA_ROOT, { tmdbCachePath });
  posterIndex = buildPosterIndex(database);
  res.json(database);
});

app.get("/api/posters/:id", (req, res) => {
  sendPoster(req, res, posterIndex);
});

app.get("/api/artwork/:id", (req, res) => {
  sendArtwork(req, res, posterIndex);
});

app.use(express.static(path.join(rootDir, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`NAS movie wall listening on http://0.0.0.0:${PORT}`);
  console.log(`Movie source: ${database.source} (${MEDIA_ROOT})`);
});
