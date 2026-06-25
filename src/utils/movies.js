const MOVIE_COLLATOR = new Intl.Collator("zh-Hans-u-co-pinyin", {
  numeric: true,
  sensitivity: "base"
});

export function flattenMovies(database) {
  return (database?.categories || []).flatMap((category) => category.movies || []);
}

export function compareMoviesByTitle(a, b) {
  return MOVIE_COLLATOR.compare(sortTitle(a), sortTitle(b)) || String(a.id).localeCompare(String(b.id));
}

export function movieCount(database) {
  return (database?.categories || []).reduce((total, category) => total + category.movies.length, 0);
}

function sortTitle(movie) {
  return String(movie.title || movie.originalTitle || movie.folderName || "");
}
