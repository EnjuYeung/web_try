import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { isMetadataCacheFresh, loadCachedMovieMap, loadDatabaseCache, pickCachedMetadata, writeDatabaseCache } from "./metadataCache.js";
import { readNfo } from "./nfo.js";
import { attachActorImages, configureTmdbCache } from "./tmdb.js";

const DEFAULT_CATEGORIES = ["其他电影", "欧美电影", "日韩电影", "动漫电影", "国产电影", "港台电影"];
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".m4v", ".ts", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const POSTER_PRIORITY = ["poster", "folder", "cover", "movie", "海报"];

export async function loadMovieDatabase({ mediaRoot, mockDbPath, cachePath, tmdbCachePath: configuredTmdbCachePath }) {
  await configureTmdbCache(configuredTmdbCachePath);
  const cached = await loadDatabaseCache(cachePath);
  if (cached && hasMovies(cached)) {
    return ensureMediaUrls(cached);
  }

  const mock = JSON.parse(await readFile(mockDbPath, "utf8"));
  return ensureMediaUrls(mock);
}

export async function scanMovies(mediaRoot, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  const cachedMovies = options.force ? new Map() : await loadCachedMovieMap(options.cachePath);
  const categories = [];
  const entries = await safeReadDir(mediaRoot);
  const foundCategoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const categoryNames = unique([...DEFAULT_CATEGORIES, ...foundCategoryNames]);

  for (const categoryName of categoryNames) {
    const categoryPath = path.join(mediaRoot, categoryName);
    const movieFolders = await collectLeafMovieFolders(categoryPath);
    const movies = [];

    for (const moviePath of movieFolders) {
      const movie = await scanMovieFolder(moviePath, categoryName, path.basename(moviePath), {
        cachedMovie: cachedMovies.get(stableId(`${categoryName}:${moviePath}`)),
        force: options.force
      });
      if (movie) movies.push(movie);
    }

    categories.push({
      id: slugify(categoryName),
      name: categoryName,
      movies: movies.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title, "zh-CN"))
    });
  }

  const database = await attachMediaUrls({
    source: "scan",
    updatedAt: new Date().toISOString(),
    mediaRoot,
    categories: categories.filter((category) => category.movies.length > 0)
  }, { forceTmdb: options.force });

  if (options.cachePath) {
    await writeDatabaseCache(options.cachePath, database);
  }

  return database;
}

export async function scanMovieById(mediaRoot, movieId, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  const cachedMovies = options.force ? new Map() : await loadCachedMovieMap(options.cachePath);
  const entries = await safeReadDir(mediaRoot);
  const foundCategoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const categoryNames = unique([...DEFAULT_CATEGORIES, ...foundCategoryNames]);

  for (const categoryName of categoryNames) {
    const categoryPath = path.join(mediaRoot, categoryName);
    const movieFolders = await collectLeafMovieFolders(categoryPath);

    for (const moviePath of movieFolders) {
      const id = stableId(`${categoryName}:${moviePath}`);
      if (id !== movieId) continue;

      const movie = await scanMovieFolder(moviePath, categoryName, path.basename(moviePath), {
        cachedMovie: cachedMovies.get(id),
        force: options.force
      });

      return movie ? (await attachMovieMediaUrls(movie, { forceTmdb: options.force })) : null;
    }
  }

  return null;
}

export function replaceMovieInDatabase(database, movie) {
  let replaced = false;
  const categories = (database.categories || []).map((category) => {
    const movies = (category.movies || []).map((existing) => {
      if (existing.id !== movie.id) return existing;
      replaced = true;
      return movie;
    });

    return { ...category, movies };
  });

  if (!replaced) {
    const categoryIndex = categories.findIndex((category) => category.name === movie.category);
    if (categoryIndex === -1) {
      categories.push({ id: slugify(movie.category), name: movie.category, movies: [movie] });
    } else {
      categories[categoryIndex] = {
        ...categories[categoryIndex],
        movies: [...categories[categoryIndex].movies, movie].sort(
          (a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title, "zh-CN")
        )
      };
    }
  }

  return {
    ...database,
    source: "scan",
    updatedAt: new Date().toISOString(),
    categories
  };
}

async function collectLeafMovieFolders(folderPath) {
  const entries = await safeReadDir(folderPath);
  const childFolders = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(folderPath, entry.name));

  if (childFolders.length === 0) {
    return [folderPath];
  }

  const leafFolders = [];
  for (const childFolder of childFolders) {
    leafFolders.push(...(await collectLeafMovieFolders(childFolder)));
  }

  return leafFolders;
}

async function scanMovieFolder(moviePath, category, folderName, options = {}) {
  const entries = await safeReadDir(moviePath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const videoFile = files.find((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const nfoFile = files.find((file) => path.extname(file).toLowerCase() === ".nfo");

  if (!videoFile && !nfoFile && !files.some((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
    return null;
  }

  const canUseCachedMetadata =
    options.cachedMovie &&
    !options.force &&
    isMetadataCacheFresh(options.cachedMovie);
  const nfo = canUseCachedMetadata ? pickCachedMetadata(options.cachedMovie) : nfoFile ? await readNfo(path.join(moviePath, nfoFile)) : {};
  const fallback = parseFolderName(folderName);
  const posterFile = pickPoster(files);
  const artworkFile = pickArtwork(files);
  const id = stableId(`${category}:${moviePath}`);
  const posterPath = posterFile ? path.join(moviePath, posterFile) : options.cachedMovie?.posterPath || "";
  const artworkPath = artworkFile ? path.join(moviePath, artworkFile) : options.cachedMovie?.artworkPath || "";
  const mediaVersion = await buildMediaVersion([posterPath, artworkPath]);

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
    metadataCachedAt: canUseCachedMetadata ? options.cachedMovie.metadataCachedAt || options.cachedMovie.updatedAt : new Date().toISOString(),
    mediaVersion,
    category,
    folderName,
    videoFile: videoFile || "",
    posterPath,
    artworkPath,
    posterUrl: mediaUrl(`/api/posters/${id}`, mediaVersion),
    artworkUrl: mediaUrl(`/api/artwork/${id}`, mediaVersion)
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
  const images = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  return images.find((file) => path.basename(file, path.extname(file)).toLowerCase().includes("fanart")) || "";
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

async function attachMediaUrls(database, options = {}) {
  const categories = [];

  for (const category of database.categories || []) {
    const movies = [];
    for (const movie of category.movies || []) {
      movies.push(await attachMovieMediaUrls(movie, options));
    }

    categories.push({ ...category, movies });
  }

  return {
    ...database,
    categories
  };
}

async function attachMovieMediaUrls(movie, options = {}) {
  const mediaVersion = movie.mediaVersion || (await buildMediaVersion([movie.posterPath, movie.artworkPath]));

  return {
    ...movie,
    mediaVersion,
    posterUrl: mediaUrl(`/api/posters/${movie.id}`, mediaVersion),
    artworkUrl: mediaUrl(`/api/artwork/${movie.id}`, mediaVersion),
    actors: await attachActorImages(movie.actors || [], { force: options.forceTmdb })
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

function ensureMediaUrls(database) {
  return {
    ...database,
    categories: (database.categories || []).map((category) => ({
      ...category,
      movies: (category.movies || []).map((movie) => ({
        ...movie,
        posterUrl: mediaUrl(`/api/posters/${movie.id}`, movie.mediaVersion),
        artworkUrl: mediaUrl(`/api/artwork/${movie.id}`, movie.mediaVersion)
      }))
    }))
  };
}

function hasMovies(database) {
  return (database.categories || []).some((category) => (category.movies || []).length > 0);
}

async function buildMediaVersion(filePaths) {
  const parts = [];

  for (const filePath of filePaths) {
    if (!filePath) continue;

    try {
      const stats = await stat(filePath);
      parts.push(`${path.basename(filePath)}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
    } catch {
      // Missing artwork falls back to generated assets; no local file version is needed.
    }
  }

  return parts.length > 0 ? stableId(parts.join("|")) : "";
}

function mediaUrl(baseUrl, version) {
  return version ? `${baseUrl}?v=${encodeURIComponent(version)}` : baseUrl;
}

async function safeReadDir(targetPath) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
