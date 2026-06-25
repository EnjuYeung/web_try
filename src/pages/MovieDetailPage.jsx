import { useEffect, useState } from "react";
import { loadMovie, rescanMovie } from "../api/movies";
import { RescanButton } from "../components/RescanButton";

export function MovieDetailPage({ movieId, onNavigate }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    loadMovie(movieId)
      .then(setMovie)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movieId]);

  async function rescan(options = {}) {
    setScanning(true);
    setError("");
    try {
      setMovie(await rescanMovie(movieId, { force: options.force }));
    } catch (err) {
      setError(err.message);
      setMovie(null);
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return <main className="detail-page detail-page--loading" aria-label="电影详情页" />;
  }

  if (error || !movie) {
    return (
      <main className="detail-page detail-page--empty" aria-label="电影详情页">
        <DetailNav onNavigate={onNavigate} onRescan={rescan} scanning={scanning} />
      </main>
    );
  }

  const metadata = [
    movie.runtime,
    movie.certification,
    movie.resolution,
    movie.codec,
    movie.bitrate,
    movie.hdrType,
    movie.audioFormat
  ].filter(Boolean);

  return (
    <main className="detail-page" aria-label="电影详情页">
      <img className="detail-backdrop" src={movie.artworkUrl} alt="" />
      <div className="detail-backdrop-shade" />

      <DetailNav onNavigate={onNavigate} onRescan={rescan} scanning={scanning} />

      <section className="detail-hero">
        <div className="detail-poster">
          <img src={movie.posterUrl} alt={movie.title} />
        </div>

        <div className="detail-copy">
          <div className="detail-title-row">
            {movie.title && <h1>{movie.title}</h1>}
            {movie.year && <span className="detail-title-year">{movie.year}</span>}
          </div>

          <RatingStars value={movie.rating} />

          {metadata.length > 0 && <div className="detail-metadata">{metadata.join(" · ")}</div>}
          {movie.tagline && <p className="detail-tagline">{movie.tagline}</p>}
          {movie.overview && <p className="detail-overview">{movie.overview}</p>}
        </div>
      </section>

      {movie.actors?.length > 0 && (
        <section className="detail-cast" aria-label="演员">
          {movie.actors.map((actor, index) => (
            <article className="cast-card" key={`${actor.name}-${actor.role}-${index}`}>
              <img src={actor.imageUrl} alt={actor.name} loading="lazy" />
              {actor.name && <div className="cast-name">{actor.name}</div>}
              {actor.role && <div className="cast-role">{actor.role}</div>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function DetailNav({ onNavigate, onRescan, scanning }) {
  return (
    <div className="detail-nav">
      <button className="detail-back" onClick={() => onNavigate("/")} type="button" aria-label="返回电影墙">
        <BackIcon />
      </button>
      <RescanButton disabled={scanning} onClick={() => onRescan()} onForceClick={() => onRescan({ force: true })} />
    </div>
  );
}

function RatingStars({ value }) {
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating)) return null;

  const fiveStarRating = Math.max(0, Math.min(5, rating / 2));

  return (
    <div className="detail-rating" aria-label={`评分 ${value}`}>
      {Array.from({ length: 5 }).map((_, index) => {
        const fill = Math.max(0, Math.min(100, (fiveStarRating - index) * 100));

        return (
          <span className="star" key={index} style={{ "--star-fill": `${fill}%` }}>
            ★
          </span>
        );
      })}
      <strong>{value}</strong>
    </div>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
