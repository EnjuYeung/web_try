import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPosterIndex, loadMovieDatabase, scanMovies } from "./scanner.js";
import { sendPoster } from "./poster.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();

const PORT = Number(process.env.PORT || 3000);
const MEDIA_ROOT = process.env.MEDIA_ROOT || "/media/movies";
const mockDbPath = path.join(__dirname, "data", "mockMovies.json");
const cachePath = path.join(__dirname, "data", "scan-cache.json");

let database = await loadMovieDatabase({ mediaRoot: MEDIA_ROOT, mockDbPath, cachePath });
let posterIndex = buildPosterIndex(database);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, source: database.source, updatedAt: database.updatedAt });
});

app.get("/api/movies", (_req, res) => {
  res.json(database);
});

app.post("/api/scan", async (_req, res) => {
  database = await scanMovies(MEDIA_ROOT);
  posterIndex = buildPosterIndex(database);
  res.json(database);
});

app.get("/api/posters/:id", (req, res) => {
  sendPoster(req, res, posterIndex);
});

app.use(express.static(path.join(rootDir, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`NAS movie wall listening on http://0.0.0.0:${PORT}`);
  console.log(`Movie source: ${database.source} (${MEDIA_ROOT})`);
});
