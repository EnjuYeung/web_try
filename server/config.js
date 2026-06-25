import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serverDir, "..");

loadEnvFile(path.join(rootDir, ".env"));

export function readServerConfig() {
  const dataRoot = process.env.DATA_ROOT || path.join(serverDir, "data");

  return {
    rootDir,
    port: Number(process.env.PORT || 3000),
    mediaRoot: process.env.MEDIA_ROOT || "/media/movies",
    mockDbPath: path.join(serverDir, "data", "mockMovies.json"),
    cachePath: path.join(dataRoot, "scan-cache.json"),
    tmdbCachePath: path.join(dataRoot, "tmdb-cache.json"),
    startupScanEnabled: process.env.STARTUP_SCAN_ENABLED !== "false",
    dailyScan: {
      enabled: process.env.DAILY_SCAN_ENABLED !== "false",
      time: process.env.DAILY_SCAN_TIME || "04:00"
    }
  };
}
