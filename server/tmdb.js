import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";
const TMDB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TMDB_MIN_REQUEST_INTERVAL_MS = 100;

let tmdbCachePath = "";
let tmdbCacheLoaded = false;
let tmdbCache = { people: {} };
let tmdbRateLimitTail = Promise.resolve();

export async function configureTmdbCache(filePath) {
  if (filePath && filePath !== tmdbCachePath) {
    tmdbCachePath = filePath;
    tmdbCacheLoaded = false;
    tmdbCache = { people: {} };
  }

  await ensureTmdbCacheLoaded();
}

export async function attachActorImages(actors, options = {}) {
  const enriched = await Promise.all(
    actors.map(async (actor) => {
      const previousActor = options.force ? null : findReusableActor(actor, options.previousActors);
      if (previousActor?.imageUrl) {
        return { ...actor, imageUrl: previousActor.imageUrl };
      }

      const imageUrl = await fetchTmdbProfileImage(actor.tmdbid, { force: options.force });
      return imageUrl ? { ...actor, imageUrl } : null;
    })
  );

  return enriched.filter(Boolean);
}

function findReusableActor(actor, previousActors = []) {
  const id = String(actor.tmdbid || "").trim();
  if (id) {
    const sameId = previousActors.find((previousActor) => String(previousActor.tmdbid || "").trim() === id);
    if (sameId) return sameId;
  }

  const name = normalizeActorText(actor.name);
  if (!name) return null;

  return previousActors.find((previousActor) => normalizeActorText(previousActor.name) === name);
}

function normalizeActorText(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchTmdbProfileImage(tmdbid, options = {}) {
  const id = String(tmdbid || "").trim();
  if (!id) return "";

  await ensureTmdbCacheLoaded();
  const cached = tmdbCache.people[id];
  if (cached && !isExpired(cached.updatedAt, TMDB_CACHE_TTL_MS) && !options.force) {
    return cached.imageUrl || "";
  }

  const apiKey = process.env.TMDB_API_KEY;
  const accessToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!apiKey && !accessToken) return "";

  try {
    await throttleTmdbRequest();

    const url = new URL(`https://api.themoviedb.org/3/person/${encodeURIComponent(id)}`);
    if (apiKey) url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "zh-CN");

    const response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });

    if (!response.ok) throw new Error(`TMDB person ${id} failed`);
    const person = await response.json();
    const imageUrl = person.profile_path ? `${TMDB_IMAGE_BASE}${person.profile_path}` : "";
    await setTmdbProfileCache(id, imageUrl);
    return imageUrl;
  } catch {
    await setTmdbProfileCache(id, "");
    return "";
  }
}

async function ensureTmdbCacheLoaded() {
  if (tmdbCacheLoaded) return;
  tmdbCacheLoaded = true;

  if (!tmdbCachePath) return;

  try {
    const cache = JSON.parse(await readFile(tmdbCachePath, "utf8"));
    tmdbCache = {
      people: cache.people && typeof cache.people === "object" ? cache.people : {}
    };
  } catch {
    tmdbCache = { people: {} };
  }
}

async function setTmdbProfileCache(id, imageUrl) {
  tmdbCache.people[id] = {
    imageUrl,
    updatedAt: new Date().toISOString()
  };

  if (tmdbCachePath) {
    await writeJson(tmdbCachePath, tmdbCache);
  }
}

function isExpired(updatedAt, ttlMs) {
  const time = Date.parse(updatedAt || "");
  return !Number.isFinite(time) || Date.now() - time > ttlMs;
}

async function throttleTmdbRequest() {
  const previous = tmdbRateLimitTail;
  let release;
  tmdbRateLimitTail = new Promise((resolve) => {
    release = resolve;
  });

  await previous;
  const now = Date.now();
  const waitMs = Math.max(0, TMDB_MIN_REQUEST_INTERVAL_MS - (now - throttleTmdbRequest.lastRequestAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throttleTmdbRequest.lastRequestAt = Date.now();
  release();
}

throttleTmdbRequest.lastRequestAt = 0;

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
