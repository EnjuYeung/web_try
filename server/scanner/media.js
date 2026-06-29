import { attachActorImages } from "../tmdb.js";
import {
  ARTWORK_DETAIL_WIDTH,
  MEDIA_ENRICHMENT_CONCURRENCY,
  POSTER_DETAIL_WIDTH,
  POSTER_WALL_WIDTH
} from "./constants.js";
import { buildMediaVersion } from "./artwork.js";
import { normalizeMovieDatabase } from "./database.js";
import { mapWithConcurrency } from "./utils.js";

export async function attachMediaUrls(database, options = {}) {
  const categories = [];
  for (const category of database.categories || []) {
    const movies = await mapWithConcurrency(
      category.movies || [],
      MEDIA_ENRICHMENT_CONCURRENCY,
      async (movie) => {
      const previousMovie = options.previousMovies?.get(movie.id);
      if (movie && previousMovie && !options.forceTmdb && sameActorList(movie.actors, previousMovie.actors)) {
        return attachMovieMediaUrls(
          { ...movie, actors: previousMovie.actors || [] },
          { ...options, skipActorTmdb: true }
        );
      }
      return attachMovieMediaUrls(movie, { ...options, previousActors: previousMovie?.actors || [] });
      }
    );
    categories.push({ ...category, movies });
  }
  return normalizeMovieDatabase({ ...database, categories });
}

export async function attachMovieMediaUrls(movie, options = {}) {
  const mediaVersion = movie.mediaVersion || (await buildMediaVersion([movie.posterPath, movie.artworkPath]));
  return {
    ...movie,
    mediaVersion,
    posterUrl: mediaUrl(`/api/posters/${movie.id}`, mediaVersion, POSTER_DETAIL_WIDTH),
    artworkUrl: mediaUrl(`/api/artwork/${movie.id}`, mediaVersion, ARTWORK_DETAIL_WIDTH),
    actors: options.skipActorTmdb
      ? movie.actors || []
      : await attachActorImages(movie.actors || [], {
          force: options.forceTmdb,
          previousActors: options.previousActors || []
        })
  };
}

export function ensureMediaUrls(database) {
  const normalized = normalizeMovieDatabase(database);
  return {
    ...normalized,
    categories: normalized.categories.map((category) => ({
      ...category,
      movies: (category.movies || []).map((movie) => ({
        ...movie,
        posterUrl: mediaUrl(`/api/posters/${movie.id}`, movie.mediaVersion, POSTER_DETAIL_WIDTH),
        artworkUrl: mediaUrl(`/api/artwork/${movie.id}`, movie.mediaVersion, ARTWORK_DETAIL_WIDTH)
      }))
    }))
  };
}

export function buildMovieWallPayload(database) {
  return {
    source: database.source,
    updatedAt: database.updatedAt,
    movies: (database.categories || []).flatMap((category) =>
      (category.movies || []).map((movie) => ({
        id: movie.id,
        title: movie.title,
        originalTitle: movie.originalTitle,
        year: movie.year,
        rating: movie.rating,
        category: category.name,
        posterUrl: mediaUrl(`/api/posters/${movie.id}`, movie.mediaVersion, POSTER_WALL_WIDTH)
      }))
    )
  };
}

export function mediaUrl(baseUrl, version, width) {
  const params = new URLSearchParams();
  if (version) params.set("v", version);
  if (width) params.set("width", String(width));
  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export function sameActorList(nextActors = [], previousActors = []) {
  if (!Array.isArray(previousActors) || nextActors.length !== previousActors.length) return false;
  return nextActors.every((actor, index) =>
    normalizeActorField(actor?.tmdbid) === normalizeActorField(previousActors[index]?.tmdbid) &&
    normalizeActorField(actor?.name) === normalizeActorField(previousActors[index]?.name) &&
    normalizeActorField(actor?.role) === normalizeActorField(previousActors[index]?.role)
  );
}

function normalizeActorField(value) {
  return String(value || "").trim();
}
