import crypto from "node:crypto";
import path from "node:path";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { readNfo } from "./nfo.js";
import { attachActorImages, configureTmdbCache } from "./tmdb.js";

const DEFAULT_CATEGORIES = ["其他电影", "欧美电影", "日韩电影", "动漫电影", "国产电影", "港台电影"];
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".m4v", ".ts", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const POSTER_PRIORITY = ["poster", "folder", "cover", "movie", "海报"];

export async function loadMovieDatabase({ mediaRoot, mockDbPath, cachePath, tmdbCachePath: configuredTmdbCachePath }) {
  await configureTmdbCache(configuredTmdbCachePath);
  const canScan = await pathExists(mediaRoot);

  if (canScan) {
    const scanned = await scanMovies(mediaRoot, { tmdbCachePath: configuredTmdbCachePath });
    if (scanned.categories.some((category) => category.movies.length > 0)) {
      await writeJson(cachePath, scanned);
      return scanned;
    }
  }

  const mock = JSON.parse(await readFile(mockDbPath, "utf8"));
  return attachMediaUrls(mock);
}

export async function scanMovies(mediaRoot, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  const categories = [];
  const entries = await safeReadDir(mediaRoot);
  const foundCategoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const categoryNames = unique([...DEFAULT_CATEGORIES, ...foundCategoryNames]);

  for (const categoryName of categoryNames) {
    const categoryPath = path.join(mediaRoot, categoryName);
    const categoryEntries = await safeReadDir(categoryPath);
    const movies = [];

    for (const entry of categoryEntries) {
      if (!entry.isDirectory()) continue;

      const moviePath = path.join(categoryPath, entry.name);
      const movie = await scanMovieFolder(moviePath, categoryName, entry.name);
      if (movie) movies.push(movie);
    }

    categories.push({
      id: slugify(categoryName),
      name: categoryName,
      movies: movies.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title, "zh-CN"))
    });
  }

  return attachMediaUrls({
    source: "scan",
    updatedAt: new Date().toISOString(),
    mediaRoot,
    categories: categories.filter((category) => category.movies.length > 0)
  });
}

async function scanMovieFolder(moviePath, category, folderName) {
  const entries = await safeReadDir(moviePath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const videoFile = files.find((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const nfoFile = files.find((file) => path.extname(file).toLowerCase() === ".nfo");

  if (!videoFile && !nfoFile && !files.some((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
    return null;
  }

  const nfo = nfoFile ? await readNfo(path.join(moviePath, nfoFile)) : {};
  const fallback = parseFolderName(folderName);
  const posterFile = pickPoster(files);
  const artworkFile = pickArtwork(files);
  const id = stableId(`${category}:${moviePath}`);

  return {
    id,
    title: nfo.title || fallback.title,
    originalTitle: nfo.originalTitle || "",
    year: nfo.year || fallback.year,
    rating: nfo.rating || "",
    certification: nfo.certification || "",
    tagline: nfo.tagline || "",
    runtime: nfo.runtime || "",
    overview: nfo.overview || "",
    resolution: nfo.resolution || "",
    codec: nfo.codec || "",
    bitrate: nfo.bitrate || "",
    hdrType: nfo.hdrType || "",
    audioFormat: nfo.audioFormat || "",
    actors: nfo.actors || [],
    category,
    folderName,
    videoFile: videoFile || "",
    posterPath: posterFile ? path.join(moviePath, posterFile) : "",
    artworkPath: artworkFile ? path.join(moviePath, artworkFile) : "",
    posterUrl: `/api/posters/${id}`,
    artworkUrl: `/api/artwork/${id}`
  };
}

function pickPoster(files) {
  const images = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (images.length === 0) return "";

  const scored = images.map((file) => {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    const priority = POSTER_PRIORITY.findIndex((name) => base.includes(name));
    return { file, score: priority === -1 ? 99 : priority };
  });

  scored.sort((a, b) => a.score - b.score || a.file.localeCompare(b.file));
  return scored[0].file;
}

function pickArtwork(files) {
  return files.find((file) => file.toLowerCase() === "fanart.jpg") || "";
}

function parseFolderName(folderName) {
  const yearMatch = folderName.match(/(?:^|[\s.(_-])((?:19|20)\d{2})(?:$|[\s.)_-])/);
  const year = yearMatch ? yearMatch[1] : "";
  const title = folderName
    .replace(/\((?:19|20)\d{2}\)/g, "")
    .replace(/\[(?:19|20)\d{2}\]/g, "")
    .replace(/(?:19|20)\d{2}/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title: title || folderName, year };
}

export function buildPosterIndex(database) {
  const index = new Map();
  for (const category of database.categories || []) {
    for (const movie of category.movies || []) {
      index.set(movie.id, movie);
    }
  }
  return index;
}

export async function attachMediaUrls(database) {
  const categories = [];

  for (const category of database.categories || []) {
    const movies = [];
    for (const movie of category.movies || []) {
      movies.push({
        ...movie,
        posterUrl: movie.posterUrl || `/api/posters/${movie.id}`,
        artworkUrl: movie.artworkUrl || `/api/artwork/${movie.id}`,
        actors: await attachActorImages(movie.actors || [])
      });
    }

    categories.push({ ...category, movies });
  }

  return {
    ...database,
    categories
  };
}

function stableId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function slugify(value) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  return ascii || stableId(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(targetPath) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function writeJson(filePath, data) {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch {
    // Cache writes are best-effort because Docker deployments may mount read-only app files.
  }
}
