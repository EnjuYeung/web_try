// Compatibility facade. Scanner implementation is split by responsibility under ./scanner/.
export { buildPosterIndex, replaceMovieInDatabase } from "./scanner/database.js";
export { listMovieCategories } from "./scanner/discovery.js";
export { buildMovieWallPayload } from "./scanner/media.js";
export { loadMovieDatabase, scanMovieById, scanMovies } from "./scanner/scanService.js";
