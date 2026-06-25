import {
  buildPosterIndex,
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
      const scannedDatabase = await scanMovies(mediaRoot, { cachePath, force, tmdbCachePath });
      if (force || database.source !== "mock" || hasMovies(scannedDatabase)) {
        database = scannedDatabase;
      }

      posterIndex = buildPosterIndex(database);
      console.log(`Full movie scan complete: ${reason}, force=${force}, movies=${movieCount(database)}`);
      return database;
    });
  }

  async function runMovieScan(movieId, { force = false } = {}) {
    return enqueueScan(async () => {
      const movie = await scanMovieById(mediaRoot, movieId, { cachePath, force, tmdbCachePath });
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
    getPosterIndex: () => posterIndex,
    runFullScan,
    runMovieScan
  };
}

function movieCount(movieDatabase) {
  return (movieDatabase.categories || []).reduce((total, category) => total + (category.movies || []).length, 0);
}

function hasMovies(movieDatabase) {
  return movieCount(movieDatabase) > 0;
}
