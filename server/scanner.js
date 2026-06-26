import crypto from "node:crypto";
import path from "node:path";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { isMetadataCacheFresh, loadCachedMovieMap, loadDatabaseCache, pickCachedMetadata, writeDatabaseCache } from "./metadataCache.js";
import { readNfo } from "./nfo.js";
import { attachActorImages, configureTmdbCache, flushTmdbCache } from "./tmdb.js";

const DEFAULT_CATEGORIES = ["其他电影", "欧美电影", "日韩电影", "动漫电影", "国产电影", "港台电影"];
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".m4v", ".ts", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const POSTER_PRIORITY = ["poster", "folder", "cover", "movie", "海报"];
const ARTWORK_NAME_PARTS = ["fanart", "backdrop", "background", "artwork"];
const IMAGE_HEADER_BYTES = 512 * 1024;
const MOVIE_SCAN_CONCURRENCY = 10;

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

  try {
    const cachedMovies = await loadCachedMovieMap(options.cachePath);
    const previousMovies = options.previousMovies || cachedMovies;
    const categories = [];
    const foundCategoryNames = await listMovieCategories(mediaRoot);
    const requestedCategories = new Set(options.categories || []);
    const categoryNames = unique([...DEFAULT_CATEGORIES, ...foundCategoryNames]).filter(
      (categoryName) => requestedCategories.size === 0 || requestedCategories.has(categoryName)
    );

    for (const categoryName of categoryNames) {
      const categoryPath = path.join(mediaRoot, categoryName);
      const movieFolders = await collectLeafMovieFolders(categoryPath);
      const scannedMovies = await mapWithConcurrency(movieFolders, MOVIE_SCAN_CONCURRENCY, async (moviePath) => {
        const id = stableId(`${categoryName}:${moviePath}`);
        const cachedMovie = cachedMovies.get(id);
        return scanMovieFolder(moviePath, categoryName, path.basename(moviePath), {
          cachedMovie,
          force: options.force,
          refreshMetadata: Boolean(cachedMovie) && !options.force
        });
      });
      const movies = scannedMovies.filter(Boolean);

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
    }, { forceTmdb: options.force, previousMovies });

    if (options.cachePath && options.writeCache !== false) {
      await writeDatabaseCache(options.cachePath, database);
    }

    return database;
  } finally {
    await flushTmdbCache();
  }
}

export async function listMovieCategories(mediaRoot) {
  const entries = await safeReadDir(mediaRoot);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function scanMovieById(mediaRoot, movieId, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  try {
    const cachedMovies = await loadCachedMovieMap(options.cachePath);
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
          force: options.force,
          refreshMetadata: true
        });

        const previousMovie = options.previousMovie?.id === id ? options.previousMovie : cachedMovies.get(id);
        if (movie && !options.force && sameActorList(movie.actors, previousMovie?.actors)) {
          return attachMovieMediaUrls({ ...movie, actors: previousMovie.actors || [] }, { skipActorTmdb: true });
        }

        return movie
          ? (await attachMovieMediaUrls(movie, {
              forceTmdb: options.force,
              previousActors: previousMovie?.actors || []
            }))
          : null;
      }
    }

    return null;
  } finally {
    await flushTmdbCache();
  }
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
    !options.refreshMetadata &&
    Object.hasOwn(options.cachedMovie, "source") &&
    Object.hasOwn(options.cachedMovie, "country") &&
    isMetadataCacheFresh(options.cachedMovie);
  const nfo = canUseCachedMetadata ? pickCachedMetadata(options.cachedMovie) : nfoFile ? await readNfo(path.join(moviePath, nfoFile)) : {};
  const fallback = parseFolderName(folderName);
  const imageSignature = await buildImageSignature(moviePath, files);
  const canReuseMediaSelection =
    options.cachedMovie &&
    !options.force &&
    options.cachedMovie.imageSignature === imageSignature &&
    Object.hasOwn(options.cachedMovie, "imageSignature");
  const posterFile = canReuseMediaSelection ? "" : await pickPoster(moviePath, files);
  const artworkFile = canReuseMediaSelection ? "" : await pickArtwork(moviePath, files);
  const id = stableId(`${category}:${moviePath}`);
  const posterPath = canReuseMediaSelection ? options.cachedMovie.posterPath || "" : posterFile ? path.join(moviePath, posterFile) : "";
  const artworkPath = canReuseMediaSelection ? options.cachedMovie.artworkPath || "" : artworkFile ? path.join(moviePath, artworkFile) : "";
  const mediaVersion = canReuseMediaSelection ? options.cachedMovie.mediaVersion || "" : await buildMediaVersion([posterPath, artworkPath]);

  return {
    id,
    title: nfo.title || fallback.title,
    originalTitle: nfo.originalTitle || "",
    year: nfo.year || fallback.year,
    rating: nfo.rating || "",
    certification: nfo.certification || "",
    country: nfo.country || "",
    tagline: nfo.tagline || "",
    runtime: nfo.runtime || "",
    overview: nfo.overview || "",
    source: nfo.source || "",
    resolution: uppercaseEnglish(nfo.resolution || ""),
    codec: uppercaseEnglish(nfo.codec || ""),
    bitrate: nfo.bitrate || "",
    hdrType: uppercaseEnglish(nfo.hdrType || ""),
    audioFormat: nfo.audioFormat || "",
    actors: nfo.actors || [],
    metadataCachedAt: canUseCachedMetadata ? options.cachedMovie.metadataCachedAt || options.cachedMovie.updatedAt : new Date().toISOString(),
    imageSignature,
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

async function pickPoster(moviePath, files) {
  const images = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (images.length === 0) return "";
  const nonArtworkImages = images.filter((file) => !isArtworkFile(file));
  const posterCandidates = nonArtworkImages.length > 0 ? nonArtworkImages : images;

  const scored = await Promise.all(posterCandidates.map(async (file) => {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    const priority = POSTER_PRIORITY.findIndex((name) => base.includes(name));
    const dimensions = await readImageDimensions(path.join(moviePath, file));
    return { file, area: dimensions.area, score: priority === -1 ? 99 : priority };
  }));

  scored.sort((a, b) => b.area - a.area || a.score - b.score || a.file.localeCompare(b.file));
  return scored[0].file;
}

async function pickArtwork(moviePath, files) {
  const images = files.filter(
    (file) =>
      IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()) &&
      path.basename(file, path.extname(file)).toLowerCase().includes("fanart")
  );
  if (images.length === 0) return "";

  const scored = await Promise.all(images.map(async (file, index) => {
    const dimensions = await readImageDimensions(path.join(moviePath, file));
    return { file, area: dimensions.area, index };
  }));

  scored.sort((a, b) => b.area - a.area || a.index - b.index);
  return scored[0].file;
}

function isArtworkFile(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  return ARTWORK_NAME_PARTS.some((name) => base.includes(name));
}

async function readImageDimensions(filePath) {
  let handle;

  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(IMAGE_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, IMAGE_HEADER_BYTES, 0);
    return normalizeDimensions(parseImageDimensions(buffer.subarray(0, bytesRead)));
  } catch {
    return { width: 0, height: 0, area: 0 };
  } finally {
    await handle?.close();
  }
}

async function buildImageSignature(moviePath, files) {
  const imageFiles = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())).sort((a, b) => a.localeCompare(b));
  const parts = [];

  for (const file of imageFiles) {
    try {
      const stats = await stat(path.join(moviePath, file));
      parts.push(`${file}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
    } catch {
      parts.push(`${file}:missing`);
    }
  }

  return parts.join("|");
}

function parseImageDimensions(buffer) {
  return parsePngDimensions(buffer) || parseJpegDimensions(buffer) || parseWebpDimensions(buffer);
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) break;

    if (isJpegStartOfFrame(marker) && offset + 7 <= buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1
    };
  }

  if (chunkType === "VP8L" && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (chunkType === "VP8 " && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function normalizeDimensions(dimensions) {
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, area: 0 };
  }

  return { width, height, area: width * height };
}

function uppercaseEnglish(value) {
  return String(value).replace(/[a-z]/g, (letter) => letter.toUpperCase());
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
      const previousMovie = options.previousMovies?.get(movie.id);
      if (movie && !options.forceTmdb && sameActorList(movie.actors, previousMovie?.actors)) {
        movies.push(await attachMovieMediaUrls({ ...movie, actors: previousMovie.actors || [] }, { ...options, skipActorTmdb: true }));
        continue;
      }

      movies.push(await attachMovieMediaUrls(movie, { ...options, previousActors: previousMovie?.actors || [] }));
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
    actors: options.skipActorTmdb
      ? movie.actors || []
      : await attachActorImages(movie.actors || [], {
          force: options.forceTmdb,
          previousActors: options.previousActors || []
        })
  };
}

function sameActorList(nextActors = [], previousActors = []) {
  if (!Array.isArray(previousActors) || nextActors.length !== previousActors.length) return false;

  return nextActors.every((actor, index) => sameActorIdentity(actor, previousActors[index]));
}

function sameActorIdentity(actor, previousActor) {
  return (
    normalizeActorField(actor?.tmdbid) === normalizeActorField(previousActor?.tmdbid) &&
    normalizeActorField(actor?.name) === normalizeActorField(previousActor?.name) &&
    normalizeActorField(actor?.role) === normalizeActorField(previousActor?.role)
  );
}

function normalizeActorField(value) {
  return String(value || "").trim();
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length && !firstError) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = await mapper(items[index], index);
        } catch (error) {
          firstError ||= error;
        }
      }
    })
  );

  if (firstError) throw firstError;
  return results;
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
