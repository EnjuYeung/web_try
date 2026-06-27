import {
  buildMovieWallPayload,
  buildPosterIndex,
  listMovieCategories,
  loadMovieDatabase,
  replaceMovieInDatabase,
  scanMovieById,
  scanMovies
} from "./scanner.js";
import { writeDatabaseCache } from "./metadataCache.js";

export async function createMovieLibrary({ mediaRoot, mockDbPath, cachePath, tmdbCachePath }) {
  let database = await loadMovieDatabase({ mediaRoot, mockDbPath, cachePath, tmdbCachePath });
  let posterIndex = buildPosterIndex(database);
  let scanQueue = Promise.resolve();

  function enqueueScan(task) {
    const job = scanQueue.catch(() => {}).then(task);
    scanQueue = job;
    return job;
  }

  async function runFullScan({ force = false, reason = "manual" } = {}) {
    return enqueueScan(async () => {
      const scannedDatabase = await scanMovies(mediaRoot, { cachePath, force, previousMovies: posterIndex, tmdbCachePath });
      if (force || database.source !== "mock" || hasMovies(scannedDatabase)) {
        database = scannedDatabase;
      }

      posterIndex = buildPosterIndex(database);
      console.log(`Full movie scan complete: ${reason}, force=${force}, movies=${movieCount(database)}`);
      return database;
    });
  }

  async function runCategoryScan(categoryNames, { force = false } = {}) {
    const categories = [...new Set((categoryNames || []).map((name) => String(name).trim()).filter(Boolean))];
    if (categories.length === 0) return database;

    return enqueueScan(async () => {
      const scannedDatabase = await scanMovies(mediaRoot, {
        cachePath,
        categories,
        force,
        previousMovies: posterIndex,
        tmdbCachePath,
        writeCache: false
      });

      database = mergeScannedCategories(database, scannedDatabase, categories);
      await writeDatabaseCache(cachePath, database);
      posterIndex = buildPosterIndex(database);
      console.log(`Category movie scan complete: categories=${categories.join(",")}, force=${force}`);
      return database;
    });
  }

  async function runMovieScan(movieId, { force = false } = {}) {
    return enqueueScan(async () => {
      const movie = await scanMovieById(mediaRoot, movieId, {
        cachePath,
        force,
        previousMovie: posterIndex.get(movieId),
        tmdbCachePath
      });
      if (!movie) return null;

      database = replaceMovieInDatabase(database, movie);
      await writeDatabaseCache(cachePath, database);
      posterIndex = buildPosterIndex(database);
      console.log(`Movie scan complete: ${movieId}, force=${force}`);
      return movie;
    });
  }

  return {
    getDatabase: () => database,
    getMovie: (movieId) => posterIndex.get(movieId),
    getMovieWall: () => buildMovieWallPayload(database),
    getPosterIndex: () => posterIndex,
    listCategories: () => listMovieCategories(mediaRoot),
    runFullScan,
    runCategoryScan,
    runMovieScan
  };
}

function mergeScannedCategories(database, scannedDatabase, scannedCategoryNames) {
  const scannedNames = new Set(scannedCategoryNames);
  const scannedCategories = new Map((scannedDatabase.categories || []).map((category) => [category.name, category]));
  const categories = [];

  for (const category of database.categories || []) {
    if (!scannedNames.has(category.name)) {
      categories.push(category);
    }
  }

  for (const categoryName of scannedCategoryNames) {
    const scannedCategory = scannedCategories.get(categoryName);
    if (scannedCategory && (scannedCategory.movies || []).length > 0) {
      categories.push(scannedCategory);
    }
  }

  return {
    ...database,
    source: "scan",
    updatedAt: scannedDatabase.updatedAt,
    mediaRoot: scannedDatabase.mediaRoot || database.mediaRoot,
    categories
  };
}

function movieCount(movieDatabase) {
  return (movieDatabase.categories || []).reduce((total, category) => total + (category.movies || []).length, 0);
}

function hasMovies(movieDatabase) {
  return movieCount(movieDatabase) > 0;
}
