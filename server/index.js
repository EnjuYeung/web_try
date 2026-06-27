import express from "express";
import path from "node:path";
import { readServerConfig } from "./config.js";
import { createMovieLibrary } from "./movieLibrary.js";
import { sendArtwork, sendPoster } from "./poster.js";
import { scheduleDailyScan } from "./scheduler.js";

const config = readServerConfig();
const app = express();
const movieLibrary = await createMovieLibrary(config);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  const database = movieLibrary.getDatabase();
  res.json({ ok: true, source: database.source, updatedAt: database.updatedAt });
});

app.get("/api/movies", (_req, res) => {
  res.json(movieLibrary.getDatabase());
});

app.get("/api/movie-wall", (_req, res) => {
  res.json(movieLibrary.getMovieWall());
});

app.get("/api/movie-categories", async (_req, res) => {
  res.json({ categories: await movieLibrary.listCategories() });
});

app.get("/api/movies/:id", (req, res) => {
  const movie = movieLibrary.getMovie(req.params.id);
  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  res.json(movie);
});

app.post("/api/scan", async (req, res) => {
  await movieLibrary.runFullScan({ force: isForceRequest(req), reason: "manual" });
  res.json(movieLibrary.getMovieWall());
});

app.post("/api/scan/categories", async (req, res) => {
  const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
  await movieLibrary.runCategoryScan(categories, { force: isForceRequest(req) });
  res.json(movieLibrary.getMovieWall());
});

app.post("/api/movies/:id/scan", async (req, res) => {
  const movie = await movieLibrary.runMovieScan(req.params.id, { force: isForceRequest(req) });
  if (!movie && movieLibrary.getDatabase().source === "mock") {
    const mockMovie = movieLibrary.getMovie(req.params.id);
    if (mockMovie) {
      res.json(mockMovie);
      return;
    }
  }

  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }
  res.json(movie);
});

app.get("/api/posters/:id", async (req, res, next) => {
  try {
    await sendPoster(req, res, movieLibrary.getPosterIndex(), config.imageCachePath);
  } catch (error) {
    next(error);
  }
});

app.get("/api/artwork/:id", async (req, res, next) => {
  try {
    await sendArtwork(req, res, movieLibrary.getPosterIndex(), config.imageCachePath);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(config.rootDir, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(config.rootDir, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Request failed", error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  const database = movieLibrary.getDatabase();
  console.log(`NAS movie wall listening on http://0.0.0.0:${config.port}`);
  console.log(`Movie source: ${database.source} (${config.mediaRoot})`);
  runStartupScan();
  scheduleDailyScan({
    ...config.dailyScan,
    runScan: () => movieLibrary.runFullScan({ force: false, reason: "scheduled" })
  });
});

function runStartupScan() {
  if (!config.startupScanEnabled) {
    console.log("Startup movie scan disabled");
    return;
  }

  setTimeout(() => {
    movieLibrary.runFullScan({ force: false, reason: "startup" }).catch((error) => {
      console.error("Startup movie scan failed", error);
    });
  }, 0);
}

function isForceRequest(req) {
  return req.query.force === "1" || req.query.force === "true" || req.body?.force === true;
}
