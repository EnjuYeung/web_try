import { readFile } from "node:fs/promises";

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function tagValues(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

export async function readNfo(nfoPath) {
  try {
    const xml = await readFile(nfoPath, "utf8");
    const rating = pickDisplayRating(xml);
    const video = pickVideoDetails(xml);
    return {
      title: tagValue(xml, "title"),
      originalTitle: tagValue(xml, "originaltitle"),
      year: tagValue(xml, "year") || tagValue(xml, "premiered").slice(0, 4),
      rating,
      certification: tagValue(xml, "certification") || tagValue(xml, "mpaa"),
      country: readCountries(xml),
      tagline: tagValue(xml, "tagline"),
      runtime: normalizeRuntime(tagValue(xml, "runtime")),
      overview: tagValue(xml, "plot") || tagValue(xml, "outline"),
      source: tagValue(xml, "source"),
      resolution: video.resolution,
      codec: video.codec,
      bitrate: normalizeBitrate(video.bitrate),
      hdrType: normalizeHdrType(video.hdrType),
      audioFormat: readAudioFormat(xml),
      actors: readActors(xml)
    };
  } catch {
    return {};
  }
}

function pickDisplayRating(xml) {
  const namedRatings = [...xml.matchAll(/<rating\b([^>]*)>([\s\S]*?)<\/rating>/gi)].map((match) => ({
    attrs: match[1],
    body: match[2]
  }));
  const imdbRating = namedRatings.find((entry) => /\bname\s*=\s*["']imdb["']/i.test(entry.attrs));
  const imdbValue = imdbRating ? normalizeRating(tagValue(imdbRating.body, "value") || imdbRating.body) : "";
  if (imdbValue) return imdbValue;

  const maxTenRatings = namedRatings
    .filter((entry) => /\bmax\s*=\s*["']10(?:\.0)?["']/i.test(entry.attrs))
    .map((entry) => ({
      value: normalizeRating(tagValue(entry.body, "value") || entry.body),
      votes: normalizeVotes(tagValue(entry.body, "votes"))
    }))
    .filter((entry) => entry.value && entry.votes > 0);

  maxTenRatings.sort((a, b) => b.votes - a.votes);

  return maxTenRatings[0]?.value || "";
}

function normalizeRating(value) {
  if (!value) return "";
  const rating = Number.parseFloat(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "";
}

function normalizeVotes(value) {
  const votes = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(votes) ? votes : 0;
}

function pickVideoDetails(xml) {
  const video = tagBlock(xml, "video");

  return {
    resolution: tagValue(video, "resolution") || tagValue(xml, "resolution"),
    codec: tagValue(video, "codec") || tagValue(xml, "codec"),
    bitrate: tagValue(video, "bitrate") || tagValue(video, "bitratemode") || tagValue(xml, "bitrate"),
    hdrType: tagValue(video, "hdrtype") || tagValue(xml, "hdrtype")
  };
}

function readAudioFormat(xml) {
  const audioCodecs = tagBlocks(xml, "audio")
    .map((audio) => [tagValue(audio, "codec"), tagValue(audio, "corec")].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
  const normalizedAudioCodecs = audioCodecs.replace(/[-\s]/g, "");

  return /truehd|dtshd|dts:x|atmos/i.test(normalizedAudioCodecs) ? "次世代音轨" : "";
}

function readActors(xml) {
  return tagBlocks(xml, "actor")
    .map((actor) => ({
      name: tagValue(actor, "name"),
      role: tagValue(actor, "role"),
      tmdbid: readActorTmdbId(actor)
    }))
    .filter((actor) => actor.name);
}

function readCountries(xml) {
  return [...new Set(tagValues(xml, "country"))].join("、");
}

function readActorTmdbId(actorXml) {
  return (
    tagValue(actorXml, "tmdbid") ||
    tagValue(actorXml, "tmdbId") ||
    typedUniqueId(actorXml, "tmdb")
  );
}

function normalizeRuntime(value) {
  if (!value) return "";
  return /^\d+$/.test(value) ? `${value} 分钟` : value;
}

function normalizeBitrate(value) {
  if (!value) return "";
  const bitrate = Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(bitrate)) return value;
  if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
  if (bitrate >= 1000) return `${Math.round(bitrate / 1000)} Kbps`;
  return `${bitrate} Kbps`;
}

function normalizeHdrType(value) {
  const hdrType = String(value || "").trim();
  if (!hdrType) return "";

  if (/^dolbyvision$/i.test(hdrType)) return "DV";
  if (/^HDR10$/i.test(hdrType)) return "HDR10";
  if (/^HDR10\+$/i.test(hdrType)) return "HDR10+";
  return "HDR";
}

function tagBlock(xml, tag) {
  return tagBlocks(xml, tag)[0] || "";
}

function tagBlocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);
}

function typedUniqueId(xml, type) {
  const pattern = new RegExp(`<uniqueid\\b[^>]*\\btype\\s*=\\s*["']${type}["'][^>]*>([\\s\\S]*?)<\\/uniqueid>`, "i");
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : "";
}
