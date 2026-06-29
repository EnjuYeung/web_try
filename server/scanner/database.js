import { slugify } from "./utils.js";

export const MOVIE_DATABASE_SCHEMA_VERSION = 2;

export function replaceMovieInDatabase(database, categoryName, movie) {
  const categories = database.categories || [];
  const targetCategoryIndex = categories.findIndex((category) => category.name === categoryName);
  const targetCategory = categories[targetCategoryIndex];
  const targetMovieIndex = (targetCategory?.movies || []).findIndex((existing) => existing.id === movie.id);

  if (targetMovieIndex !== -1) {
    const nextCategories = categories.slice();
    const movies = targetCategory.movies.slice();
    movies[targetMovieIndex] = movie;
    nextCategories[targetCategoryIndex] = { ...targetCategory, movies };
    return updatedDatabase(database, nextCategories);
  }

  const existingCategoryIndex = categories.findIndex((category) =>
    (category.movies || []).some((existing) => existing.id === movie.id)
  );
  const nextCategories = categories.slice();
  if (existingCategoryIndex !== -1) {
    const existingCategory = categories[existingCategoryIndex];
    nextCategories[existingCategoryIndex] = {
      ...existingCategory,
      movies: existingCategory.movies.filter((existing) => existing.id !== movie.id)
    };
  }

  if (targetCategoryIndex === -1) {
    nextCategories.push({ id: slugify(categoryName), name: categoryName, movies: [movie] });
  } else {
    nextCategories[targetCategoryIndex] = {
      ...targetCategory,
      movies: sortMovies([...(targetCategory.movies || []), movie])
    };
  }
  return updatedDatabase(database, nextCategories);
}

export function buildPosterIndex(database) {
  const index = new Map();
  for (const category of database.categories || []) {
    for (const movie of category.movies || []) {
      index.set(movie.id, { ...movie, category: category.name });
    }
  }
  return index;
}

export function normalizeMovieDatabase(database) {
  return {
    ...database,
    schemaVersion: MOVIE_DATABASE_SCHEMA_VERSION,
    categories: (database.categories || []).map((category) => ({
      ...category,
      movies: (category.movies || []).map(stripDerivedMovieFields)
    }))
  };
}

export function sortMovies(movies) {
  return movies.sort(
    (a, b) => Number(b.year || 0) - Number(a.year || 0) || a.title.localeCompare(b.title, "zh-CN")
  );
}

export function hasMovies(database) {
  return (database.categories || []).some((category) => (category.movies || []).length > 0);
}

function updatedDatabase(database, categories) {
  return normalizeMovieDatabase({
    ...database,
    source: "scan",
    updatedAt: new Date().toISOString(),
    categories
  });
}

function stripDerivedMovieFields(movie) {
  const { category: _derivedCategory, ...storedMovie } = movie;
  return storedMovie;
}
