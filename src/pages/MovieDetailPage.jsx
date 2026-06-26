import { Fragment, useEffect, useState } from "react";
import { loadMovie, rescanMovie } from "../api/movies";
import { RescanButton } from "../components/RescanButton";
import { resolveCertificationBadge } from "../ratingBadges";

export function MovieDetailPage({ movieId, onBack }) {
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
        <DetailNav onBack={onBack} onRescan={rescan} scanning={scanning} />
      </main>
    );
  }

  const certificationBadge = resolveCertificationBadge(movie);
  const primaryMetadata = [
    metadataRating(movie.rating),
    metadataText("runtime", movie.runtime),
    metadataCertification(movie.certification, certificationBadge)
  ].filter(Boolean);
  const technicalMetadata = [
    metadataText("resolution", movie.resolution),
    metadataText("codec", movie.codec),
    metadataText("hdrType", movie.hdrType),
    metadataText("audioFormat", movie.audioFormat)
  ].filter(Boolean);
  const isBluRaySource = matchesBluRaySource(movie.source);

  return (
    <main className="detail-page" aria-label="电影详情页">
      <img className="detail-backdrop" src={movie.artworkUrl} alt="" />
      <div className="detail-backdrop-shade" />

      <DetailNav onBack={onBack} onRescan={rescan} scanning={scanning} />

      <section className="detail-hero">
        <div className="detail-poster">
          <img src={movie.posterUrl} alt={movie.title} />
        </div>

        <div className="detail-copy">
          <div className="detail-title-row">
            {movie.title && <h1>{movie.title}</h1>}
            {movie.year && <span className="detail-title-year">{movie.year}</span>}
            {isBluRaySource && (
              <span className="detail-title-source" aria-label="Blu-ray" title="Blu-ray">
                💿
              </span>
            )}
          </div>

          <MetadataList className="detail-primary-metadata" items={primaryMetadata} />
          <MetadataList className="detail-metadata" items={technicalMetadata} />
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

function metadataText(key, value) {
  return value ? { key, content: value } : null;
}

function metadataRating(value) {
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating)) return null;

  return {
    key: "rating",
    content: <RatingStars value={value} />
  };
}

function metadataCertification(value, badge) {
  if (!value) return null;
  if (!badge) return metadataText("certification", value);

  return {
    key: "certification",
    content: (
      <img
        className="detail-certification-badge"
        src={badge.src}
        alt={`${value} 分级`}
        title={value}
        draggable="false"
      />
    )
  };
}

function MetadataList({ className, items }) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <span className="detail-metadata-separator">·</span>}
          <span className="detail-metadata-item">{item.content}</span>
        </Fragment>
      ))}
    </div>
  );
}

function matchesBluRaySource(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .includes("bluray");
}

function DetailNav({ onBack, onRescan, scanning }) {
  return (
    <div className="detail-nav">
      <button className="detail-back" onClick={onBack} type="button" aria-label="返回上一页">
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
    <span className="detail-rating" aria-label={`评分 ${value}`}>
      {Array.from({ length: 5 }).map((_, index) => {
        const fill = Math.max(0, Math.min(100, (fiveStarRating - index) * 100));

        return (
          <span className="star" key={index} style={{ "--star-fill": `${fill}%` }}>
            ★
          </span>
        );
      })}
      <strong>{value}</strong>
    </span>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
