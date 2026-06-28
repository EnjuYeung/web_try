import { useEffect, useMemo, useState } from "react";
import { loadMovies } from "../api/movies";

const COLUMN_COUNT = 9;
const POSTERS_PER_COLUMN = 10;

export function PosterLandingPage({ onEnter }) {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    document.body.classList.add("poster-landing-active");

    loadMovies()
      .then((result) => setMovies(result.movies || []))
      .catch(() => setMovies([]));

    return () => document.body.classList.remove("poster-landing-active");
  }, []);

  const columns = useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, columnIndex) =>
        takeRandomMovies(movies, POSTERS_PER_COLUMN, columnIndex)
      ),
    [movies]
  );

  function handleKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onEnter();
  }

  return (
    <main
      aria-label="进入 Juen's 电影库"
      className="poster-landing"
      onClick={onEnter}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex="0"
    >
      <div aria-hidden="true" className="poster-stream-grid">
        {columns.map((column, columnIndex) => (
          <PosterStreamColumn
            columnIndex={columnIndex}
            key={columnIndex}
            movies={column}
          />
        ))}
      </div>
      <div aria-hidden="true" className="poster-landing-shade" />
      <div className="poster-landing-brand">Juen&apos;s</div>
    </main>
  );
}

function PosterStreamColumn({ columnIndex, movies }) {
  const style = {
    "--stream-delay": `${-columnIndex * 7.3}s`,
    "--stream-duration": `${78 + (columnIndex % 4) * 9}s`
  };

  return (
    <div
      className={`poster-stream-column${columnIndex % 2 ? " poster-stream-column--reverse" : ""}`}
      style={style}
    >
      <div className="poster-stream-reel">
        <PosterStreamGroup movies={movies} />
        <PosterStreamGroup movies={movies} />
      </div>
    </div>
  );
}

function PosterStreamGroup({ movies }) {
  return (
    <div className="poster-stream-group">
      {movies.map((movie, index) => (
        <div className="poster-stream-card" key={`${movie.id}-${index}`}>
          <img alt="" decoding="async" loading="eager" src={movie.posterUrl} />
        </div>
      ))}
    </div>
  );
}

function takeRandomMovies(movies, count, salt) {
  if (movies.length === 0) return [];

  const shuffled = [...movies];
  const random = createRandomSource(salt);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return Array.from({ length: count }, (_, index) => shuffled[index % shuffled.length]);
}

function createRandomSource(salt) {
  const seed = new Uint32Array(1);
  window.crypto?.getRandomValues?.(seed);
  let state = (seed[0] || Math.floor(Math.random() * 2 ** 32)) ^ ((salt + 1) * 0x9e3779b9);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
