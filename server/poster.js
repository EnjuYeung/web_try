import { createReadStream, statSync } from "node:fs";
import crypto from "node:crypto";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MOCK_PALETTES = {
  space: ["#07111f", "#4056f4", "#f4d35e"],
  city: ["#111827", "#f97316", "#38bdf8"],
  snow: ["#0f172a", "#93c5fd", "#f8fafc"],
  race: ["#111111", "#ef4444", "#facc15"],
  rain: ["#102a43", "#2dd4bf", "#dbeafe"],
  sea: ["#0c4a6e", "#22d3ee", "#fef3c7"],
  maze: ["#18181b", "#a3e635", "#f5f5f5"],
  cloud: ["#1e293b", "#f9a8d4", "#bae6fd"],
  garden: ["#052e16", "#84cc16", "#fde68a"],
  summer: ["#164e63", "#fb7185", "#fef08a"],
  river: ["#1c1917", "#14b8a6", "#f5f5f4"],
  factory: ["#27272a", "#f59e0b", "#d4d4d8"],
  neon: ["#171717", "#ec4899", "#22d3ee"],
  island: ["#0f3d3e", "#fbbf24", "#ccfbf1"],
  box: ["#030712", "#8b5cf6", "#e5e7eb"],
  desert: ["#1f2937", "#f97316", "#fde68a"]
};
const IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";
const POSTER_WIDTHS = new Set([340, 520]);
const ARTWORK_WIDTHS = new Set([1920]);
const IMAGE_VARIANT_VERSION = 1;
const IMAGE_TRANSFORM_CONCURRENCY = 2;
const variantJobs = new Map();
const transformQueue = [];
let activeTransforms = 0;

sharp.cache({ files: 20, items: 100, memory: 32 });
sharp.concurrency(1);

export async function sendPoster(req, res, posterIndex, imageCachePath = "") {
  const movie = posterIndex.get(req.params.id);
  if (!movie) {
    res.status(404).json({ error: "Poster not found" });
    return;
  }

  const filePath = await resolveImageVariant(movie.posterPath, {
    cacheRoot: imageCachePath,
    id: movie.id,
    kind: "poster",
    width: requestedWidth(req, POSTER_WIDTHS)
  });
  sendFileOrFallback(res, filePath, () => sendMockPoster(res, movie));
}

export async function sendArtwork(req, res, posterIndex, imageCachePath = "") {
  const movie = posterIndex.get(req.params.id);
  if (!movie) {
    res.status(404).json({ error: "Artwork not found" });
    return;
  }

  const filePath = await resolveImageVariant(movie.artworkPath, {
    cacheRoot: imageCachePath,
    id: movie.id,
    kind: "artwork",
    width: requestedWidth(req, ARTWORK_WIDTHS)
  });
  sendFileOrFallback(res, filePath, () => sendMockArtwork(res, movie));
}

async function resolveImageVariant(filePath, options) {
  if (!filePath || !options.cacheRoot || !options.width) return filePath;

  let sourceStats;
  try {
    sourceStats = await stat(filePath);
  } catch {
    return filePath;
  }

  const signature = crypto
    .createHash("sha1")
    .update(`${filePath}:${sourceStats.size}:${Math.trunc(sourceStats.mtimeMs)}:${options.width}:${IMAGE_VARIANT_VERSION}`)
    .digest("hex")
    .slice(0, 16);
  const cacheId = crypto.createHash("sha1").update(options.id).digest("hex").slice(0, 16);
  const directory = path.join(options.cacheRoot, options.kind);
  const outputPath = path.join(directory, `${cacheId}-${options.width}-${signature}.webp`);

  try {
    await access(outputPath);
    return outputPath;
  } catch {
    // Generate the variant below.
  }

  let job = variantJobs.get(outputPath);
  if (!job) {
    job = withTransformSlot(() => generateImageVariant(filePath, outputPath, options.width))
      .finally(() => {
        variantJobs.delete(outputPath);
      });
    variantJobs.set(outputPath, job);
  }

  try {
    await job;
    return outputPath;
  } catch {
    return filePath;
  }
}

async function withTransformSlot(task) {
  if (activeTransforms >= IMAGE_TRANSFORM_CONCURRENCY) {
    await new Promise((resolve) => transformQueue.push(resolve));
  }

  activeTransforms += 1;
  try {
    return await task();
  } finally {
    activeTransforms -= 1;
    transformQueue.shift()?.();
  }
}

async function generateImageVariant(filePath, outputPath, width) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await sharp(filePath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ effort: 4, quality: 82 })
      .toFile(temporaryPath);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function requestedWidth(req, allowedWidths) {
  const width = Number.parseInt(req.query.width || "", 10);
  return allowedWidths.has(width) ? width : 0;
}

function sendFileOrFallback(res, filePath, fallback) {
  if (!filePath) {
    fallback();
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    fallback();
    return;
  }

  const etag = fileEtag(stats);
  const lastModified = stats.mtime.toUTCString();
  res.setHeader("Cache-Control", IMAGE_CACHE_CONTROL);
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", lastModified);

  if (isFreshRequest(res.req, etag, stats.mtime)) {
    res.status(304).end();
    return;
  }

  res.type(path.extname(filePath));
  const stream = createReadStream(filePath);
  stream.once("error", (error) => {
    if (res.headersSent || res.destroyed || res.writableEnded) {
      if (!res.destroyed) res.destroy(error);
      return;
    }

    stream.unpipe(res);
    res.removeHeader("ETag");
    res.removeHeader("Last-Modified");
    fallback();
  });
  stream.pipe(res);
}

function sendMockPoster(res, movie) {
  const [bg, accent, text] = MOCK_PALETTES[movie.posterSeed] || MOCK_PALETTES.space;
  const safeTitle = escapeXml(movie.title || "Movie");
  const safeYear = escapeXml(movie.year || "");

  setGeneratedImageCacheHeaders(res);
  res.type("image/svg+xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="0.62" stop-color="${accent}"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
    <radialGradient id="r" cx="30%" cy="24%" r="72%">
      <stop offset="0" stop-color="${text}" stop-opacity=".34"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <rect width="600" height="900" fill="url(#r)"/>
  <rect x="38" y="42" width="524" height="816" rx="22" fill="none" stroke="${text}" stroke-opacity=".28" stroke-width="2"/>
  <text x="52" y="104" fill="${text}" opacity=".78" font-size="28" font-family="Arial, sans-serif">${safeYear}</text>
  <text x="52" y="720" fill="${text}" font-size="48" font-weight="700" font-family="Arial, sans-serif">
    ${wrapTitle(safeTitle)}
  </text>
  <text x="52" y="812" fill="${text}" opacity=".82" font-size="24" font-family="Arial, sans-serif">NAS MOVIE</text>
</svg>`);
}

function sendMockArtwork(res, movie) {
  const [bg, accent, text] = MOCK_PALETTES[movie.posterSeed] || MOCK_PALETTES.space;
  const safeTitle = escapeXml(movie.title || "Movie");

  setGeneratedImageCacheHeaders(res);
  res.type("image/svg+xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="0.58" stop-color="${accent}"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
    <radialGradient id="r" cx="68%" cy="28%" r="64%">
      <stop offset="0" stop-color="${text}" stop-opacity=".24"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <rect width="1600" height="900" fill="url(#r)"/>
  <text x="86" y="742" fill="${text}" opacity=".72" font-size="76" font-weight="700" font-family="Arial, sans-serif">${safeTitle}</text>
</svg>`);
}

function fileEtag(stats) {
  return `W/"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
}

function isFreshRequest(req, etag, mtime) {
  if (req.headers["if-none-match"] === etag) return true;

  const ifModifiedSince = Date.parse(req.headers["if-modified-since"] || "");
  return Number.isFinite(ifModifiedSince) && ifModifiedSince >= Math.trunc(mtime.getTime() / 1000) * 1000;
}

function setGeneratedImageCacheHeaders(res) {
  res.setHeader("Cache-Control", IMAGE_CACHE_CONTROL);
}

function wrapTitle(title) {
  const chars = [...title];
  const first = chars.slice(0, 8).join("");
  const second = chars.slice(8, 16).join("");
  if (!second) return `<tspan x="52">${first}</tspan>`;
  return `<tspan x="52">${first}</tspan><tspan x="52" dy="58">${second}</tspan>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
