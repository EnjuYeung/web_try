import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  loadCachedMovieMap,
  loadDatabaseCache,
  writeDatabaseCache
} from "../metadataCache.js";
import { configureTmdbCache, flushTmdbCache } from "../tmdb.js";
import { DEFAULT_CATEGORIES, MOVIE_SCAN_CONCURRENCY } from "./constants.js";
import { hasMovies, sortMovies } from "./database.js";
import { collectLeafMovieFolders, listMovieCategories } from "./discovery.js";
import { attachMediaUrls, attachMovieMediaUrls, ensureMediaUrls, sameActorList } from "./media.js";
import { scanMovieFolder } from "./movieFolderScanner.js";
import { mapWithConcurrency, slugify, stableId, unique } from "./utils.js";

export async function loadMovieDatabase({ mediaRoot, mockDbPath, cachePath, tmdbCachePath }) {
  await configureTmdbCache(tmdbCachePath);
  const cached = await loadDatabaseCache(cachePath);
  if (cached && hasMovies(cached)) return ensureMediaUrls(cached);

  const mock = JSON.parse(await readFile(mockDbPath, "utf8"));
  return ensureMediaUrls(mock);
}

export async function scanMovies(mediaRoot, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  try {
    const cachedMovies = await loadCachedMovieMap(options.cachePath);
    const previousMovies = options.previousMovies || cachedMovies;
    const foundCategoryNames = await listMovieCategories(mediaRoot);
    const requestedCategories = new Set(options.categories || []);
    const categoryNames = unique([...DEFAULT_CATEGORIES, ...foundCategoryNames]).filter(
      (categoryName) => requestedCategories.size === 0 || requestedCategories.has(categoryName)
    );

    const categories = [];
    for (const categoryName of categoryNames) {
      const categoryPath = path.join(mediaRoot, categoryName);
      const movieFolders = await collectLeafMovieFolders(categoryPath);
      const scannedMovies = await mapWithConcurrency(
        movieFolders,
        MOVIE_SCAN_CONCURRENCY,
        async (moviePath) => {
          const id = stableId(`${categoryName}:${moviePath}`);
          return scanMovieFolder(moviePath, categoryName, path.basename(moviePath), {
            cachedMovie: cachedMovies.get(id),
            force: options.force,
            refreshMetadata: false
          });
        }
      );
      categories.push({
        id: slugify(categoryName),
        name: categoryName,
        movies: sortMovies(scannedMovies.filter(Boolean))
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

export async function scanMovieById(mediaRoot, movieId, options = {}) {
  await configureTmdbCache(options.tmdbCachePath);
  try {
    const cachedMovies = await loadCachedMovieMap(options.cachePath);
    const categoryNames = unique([...DEFAULT_CATEGORIES, ...(await listMovieCategories(mediaRoot))]);

    for (const categoryName of categoryNames) {
      const movieFolders = await collectLeafMovieFolders(path.join(mediaRoot, categoryName));
      for (const moviePath of movieFolders) {
        const id = stableId(`${categoryName}:${moviePath}`);
        if (id !== movieId) continue;

        const movie = await scanMovieFolder(moviePath, categoryName, path.basename(moviePath), {
          cachedMovie: cachedMovies.get(id),
          force: options.force,
          refreshMetadata: true
        });
        const previousMovie = options.previousMovie?.id === id ? options.previousMovie : cachedMovies.get(id);
        if (movie && previousMovie && !options.force && sameActorList(movie.actors, previousMovie.actors)) {
          return {
            categoryName,
            movie: await attachMovieMediaUrls(
              { ...movie, actors: previousMovie.actors || [] },
              { skipActorTmdb: true }
            )
          };
        }
        return movie
          ? {
              categoryName,
              movie: await attachMovieMediaUrls(movie, {
                forceTmdb: options.force,
                previousActors: previousMovie?.actors || []
              })
            }
          : null;
      }
    }
    return null;
  } finally {
    await flushTmdbCache();
  }
}
