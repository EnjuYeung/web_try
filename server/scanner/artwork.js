import path from "node:path";
import { open, stat } from "node:fs/promises";
import { IMAGE_EXTENSIONS } from "./constants.js";
import { stableId } from "./utils.js";

const POSTER_PRIORITY = ["poster", "folder", "cover", "movie", "海报"];
const ARTWORK_NAME_PARTS = ["fanart", "backdrop", "background", "artwork"];
const IMAGE_HEADER_BYTES = 512 * 1024;

export async function pickPoster(moviePath, files) {
  const images = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (images.length === 0) return "";
  const nonArtworkImages = images.filter((file) => !isArtworkFile(file));
  const posterCandidates = nonArtworkImages.length > 0 ? nonArtworkImages : images;

  const scored = await Promise.all(posterCandidates.map(async (file) => {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    const priority = POSTER_PRIORITY.findIndex((name) => base.includes(name));
    const dimensions = await readImageDimensions(path.join(moviePath, file));
    return { file, area: dimensions.area, score: priority === -1 ? 99 : priority };
  }));

  scored.sort((a, b) => b.area - a.area || a.score - b.score || a.file.localeCompare(b.file));
  return scored[0].file;
}

export async function pickArtwork(moviePath, files) {
  const images = files.filter(
    (file) =>
      IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()) &&
      path.basename(file, path.extname(file)).toLowerCase().includes("fanart")
  );
  if (images.length === 0) return "";

  const scored = await Promise.all(images.map(async (file, index) => {
    const dimensions = await readImageDimensions(path.join(moviePath, file));
    return { file, area: dimensions.area, index };
  }));

  scored.sort((a, b) => b.area - a.area || a.index - b.index);
  return scored[0].file;
}

export async function buildImageSignature(moviePath, files) {
  const imageFiles = files
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const parts = [];

  for (const file of imageFiles) {
    try {
      const stats = await stat(path.join(moviePath, file));
      parts.push(`${file}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
    } catch {
      parts.push(`${file}:missing`);
    }
  }
  return parts.join("|");
}

export async function buildMediaVersion(filePaths) {
  const parts = [];
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      const stats = await stat(filePath);
      parts.push(`${path.basename(filePath)}:${stats.size}:${Math.trunc(stats.mtimeMs)}`);
    } catch {
      // Missing artwork uses generated assets, so it needs no local-file version.
    }
  }
  return parts.length > 0 ? stableId(parts.join("|")) : "";
}

function isArtworkFile(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  return ARTWORK_NAME_PARTS.some((name) => base.includes(name));
}

async function readImageDimensions(filePath) {
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(IMAGE_HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, IMAGE_HEADER_BYTES, 0);
    return normalizeDimensions(parseImageDimensions(buffer.subarray(0, bytesRead)));
  } catch {
    return { width: 0, height: 0, area: 0 };
  } finally {
    await handle?.close();
  }
}

function parseImageDimensions(buffer) {
  return parsePngDimensions(buffer) || parseJpegDimensions(buffer) || parseWebpDimensions(buffer);
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) break;
    if (isJpegStartOfFrame(marker) && offset + 7 <= buffer.length) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function isJpegStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") {
    return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
  }
  if (chunkType === "VP8L" && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunkType === "VP8 " && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function normalizeDimensions(dimensions) {
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, area: 0 };
  }
  return { width, height, area: width * height };
}
