import path from "node:path";
import { readMediaBitrate } from "../mediaProbe.js";
import { isMetadataCacheFresh, pickCachedMetadata } from "../metadataCache.js";
import { readNfo } from "../nfo.js";
import { IMAGE_EXTENSIONS, MEDIA_METADATA_VERSION, VIDEO_EXTENSIONS } from "./constants.js";
import { buildImageSignature, buildMediaVersion, pickArtwork, pickPoster } from "./artwork.js";
import { safeReadDir } from "./discovery.js";
import { mediaUrl } from "./media.js";
import { stableId } from "./utils.js";

export async function scanMovieFolder(moviePath, category, folderName, options = {}) {
  const entries = await safeReadDir(moviePath);
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const videoFile = files.find((file) => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const nfoFile = files.find((file) => path.extname(file).toLowerCase() === ".nfo");

  if (!videoFile && !nfoFile && !files.some((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
    return null;
  }

  const canUseCachedMetadata =
    options.cachedMovie &&
    !options.force &&
    !options.refreshMetadata &&
    Object.hasOwn(options.cachedMovie, "source") &&
    Object.hasOwn(options.cachedMovie, "country") &&
    options.cachedMovie.mediaMetadataVersion === MEDIA_METADATA_VERSION &&
    isMetadataCacheFresh(options.cachedMovie);
  const nfo = canUseCachedMetadata
    ? pickCachedMetadata(options.cachedMovie)
    : nfoFile
      ? await readNfo(path.join(moviePath, nfoFile))
      : {};
  const bitrate =
    canUseCachedMetadata || !videoFile
      ? nfo.bitrate || ""
      : (await readMediaBitrate(path.join(moviePath, videoFile))) || nfo.bitrate || "";
  const fallback = parseFolderName(folderName);
  const imageSignature = await buildImageSignature(moviePath, files);
  const canReuseMediaSelection =
    options.cachedMovie &&
    !options.force &&
    options.cachedMovie.imageSignature === imageSignature;
  const posterFile = canReuseMediaSelection ? "" : await pickPoster(moviePath, files);
  const artworkFile = canReuseMediaSelection ? "" : await pickArtwork(moviePath, files);
  const id = stableId(`${category}:${moviePath}`);
  const posterPath = canReuseMediaSelection
    ? options.cachedMovie.posterPath || ""
    : posterFile
      ? path.join(moviePath, posterFile)
      : "";
  const artworkPath = canReuseMediaSelection
    ? options.cachedMovie.artworkPath || ""
    : artworkFile
      ? path.join(moviePath, artworkFile)
      : "";
  const mediaVersion = canReuseMediaSelection
    ? options.cachedMovie.mediaVersion || ""
    : await buildMediaVersion([posterPath, artworkPath]);

  return {
    id,
    title: nfo.title || fallback.title,
    originalTitle: nfo.originalTitle || "",
    year: nfo.year || fallback.year,
    rating: nfo.rating || "",
    certification: nfo.certification || "",
    country: nfo.country || "",
    tagline: nfo.tagline || "",
    runtime: nfo.runtime || "",
    overview: nfo.overview || "",
    source: nfo.source || "",
    resolution: uppercaseEnglish(nfo.resolution || ""),
    codec: uppercaseEnglish(nfo.codec || ""),
    bitrate,
    hdrType: uppercaseEnglish(nfo.hdrType || ""),
    audioFormat: nfo.audioFormat || "",
    actors: nfo.actors || [],
    mediaMetadataVersion: MEDIA_METADATA_VERSION,
    metadataCachedAt: canUseCachedMetadata
      ? options.cachedMovie.metadataCachedAt || options.cachedMovie.updatedAt
      : new Date().toISOString(),
    imageSignature,
    mediaVersion,
    folderName,
    videoFile: videoFile || "",
    posterPath,
    artworkPath,
    posterUrl: mediaUrl(`/api/posters/${id}`, mediaVersion),
    artworkUrl: mediaUrl(`/api/artwork/${id}`, mediaVersion)
  };
}

function uppercaseEnglish(value) {
  return String(value).replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

function parseFolderName(folderName) {
  const yearMatch = folderName.match(/(?:^|[\s.(_-])((?:19|20)\d{2})(?:$|[\s.)_-])/);
  const year = yearMatch ? yearMatch[1] : "";
  const title = folderName
    .replace(/\((?:19|20)\d{2}\)/g, "")
    .replace(/\[(?:19|20)\d{2}\]/g, "")
    .replace(/(?:19|20)\d{2}/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || folderName, year };
}
