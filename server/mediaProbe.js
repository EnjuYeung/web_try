import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFPROBE_CONCURRENCY = 2;
const FFPROBE_TIMEOUT_MS = 30_000;

let activeProbes = 0;
const probeQueue = [];

export async function readMediaBitrate(filePath) {
  if (!filePath) return "";

  return withProbeSlot(async () => {
    try {
      const { stdout } = await execFileAsync(
        process.env.FFPROBE_PATH || "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration,size,bit_rate",
          "-of",
          "json",
          filePath
        ],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          timeout: FFPROBE_TIMEOUT_MS
        }
      );
      const format = JSON.parse(stdout).format || {};
      const bitrate = positiveNumber(format.bit_rate) || calculateAverageBitrate(format.size, format.duration);
      return formatBitrate(bitrate);
    } catch {
      return "";
    }
  });
}

function calculateAverageBitrate(size, duration) {
  const bytes = positiveNumber(size);
  const seconds = positiveNumber(duration);
  return bytes && seconds ? (bytes * 8) / seconds : 0;
}

function formatBitrate(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(value / 1_000)} Kbps`;
}

function positiveNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function withProbeSlot(task) {
  if (activeProbes >= FFPROBE_CONCURRENCY) {
    await new Promise((resolve) => probeQueue.push(resolve));
  }

  activeProbes += 1;
  try {
    return await task();
  } finally {
    activeProbes -= 1;
    probeQueue.shift()?.();
  }
}
