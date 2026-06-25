export function MovieCard({ movie, onOpen }) {
  return (
    <a className="movie-card" href={`/movies/${movie.id}`} onClick={(event) => onOpen(event, movie)} title={movie.title}>
      <div className="poster-frame">
        <img src={movie.posterUrl} alt={movie.title} loading="lazy" />
        <div className="poster-overlay">
          {movie.year && <div className="year">{movie.year}</div>}
          {movie.rating && <div className="rating">★ {movie.rating}</div>}
        </div>
      </div>
    </a>
  );
}
