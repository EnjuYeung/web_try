import { readFile } from "node:fs/promises";
import { writeJsonAtomic } from "./jsonFile.js";
import { normalizeMovieDatabase } from "./scanner/database.js";

const DEFAULT_METADATA_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadCachedMovieMap(cachePath) {
  const cachedDatabase = await loadDatabaseCache(cachePath);
  if (!cachedDatabase) return new Map();

  const movies = new Map();
  for (const category of cachedDatabase.categories || []) {
    for (const movie of category.movies || []) {
      movies.set(movie.id, movie);
    }
  }

  return movies;
}

export async function loadDatabaseCache(cachePath) {
  if (!cachePath) return null;

  try {
    return normalizeMovieDatabase(JSON.parse(await readFile(cachePath, "utf8")));
  } catch {
    return null;
  }
}

export function pickCachedMetadata(movie) {
  return {
    title: movie.title || "",
    originalTitle: movie.originalTitle || "",
    year: movie.year || "",
    rating: movie.rating || "",
    certification: movie.certification || "",
    country: movie.country || "",
    tagline: movie.tagline || "",
    runtime: movie.runtime || "",
    overview: movie.overview || "",
    source: movie.source || "",
    resolution: movie.resolution || "",
    codec: movie.codec || "",
    bitrate: movie.bitrate || "",
    hdrType: movie.hdrType || "",
    audioFormat: movie.audioFormat || "",
    actors: (movie.actors || []).map(({ imageUrl, ...actor }) => actor)
  };
}

export function isMetadataCacheFresh(movie) {
  return !isExpired(movie.metadataCachedAt || movie.updatedAt, metadataCacheTtlMs());
}

export async function writeDatabaseCache(cachePath, database) {
  if (!cachePath) return;

  try {
    await writeJsonAtomic(cachePath, normalizeMovieDatabase(database));
  } catch {
    // Cache writes are best-effort because Docker deployments may mount read-only app files.
  }
}

function metadataCacheTtlMs() {
  const days = Number.parseFloat(process.env.METADATA_CACHE_TTL_DAYS || "");
  return Number.isFinite(days) && days >= 0 ? days * 24 * 60 * 60 * 1000 : DEFAULT_METADATA_CACHE_TTL_MS;
}

function isExpired(updatedAt, ttlMs) {
  const time = Date.parse(updatedAt || "");
  return !Number.isFinite(time) || Date.now() - time > ttlMs;
}
