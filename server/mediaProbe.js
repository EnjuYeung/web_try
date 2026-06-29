import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFPROBE_CONCURRENCY = 2;
const FFPROBE_TIMEOUT_MS = 30_000;

let activeProbes = 0;
const probeQueue = [];

export async function readMediaMetadata(filePath) {
  if (!filePath) return emptyMediaMetadata();

  return withProbeSlot(async () => {
    try {
      const { stdout } = await execFileAsync(
        process.env.FFPROBE_PATH || "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "format=duration,size,bit_rate:stream_side_data",
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
      const metadata = JSON.parse(stdout);
      const format = metadata.format || {};
      const bitrate = positiveNumber(format.bit_rate) || calculateAverageBitrate(format.size, format.duration);
      const dvCustomProfile = readDvCustomProfile(metadata);
      return {
        bitrate: formatBitrate(bitrate),
        hdrType: dvCustomProfile ? "DV" : "",
        dvCustomProfile
      };
    } catch {
      return emptyMediaMetadata();
    }
  });
}

export async function readMediaBitrate(filePath) {
  return (await readMediaMetadata(filePath)).bitrate;
}

function emptyMediaMetadata() {
  return {
    bitrate: "",
    hdrType: "",
    dvCustomProfile: ""
  };
}

function readDvCustomProfile(metadata) {
  const sideData = (metadata.streams || []).flatMap((stream) => stream.side_data_list || []);
  const dovi = sideData.find((entry) => /dovi configuration record/i.test(entry.side_data_type || ""));
  const dvProfile = positiveInteger(dovi?.dv_profile);
  if (!dvProfile) return "";

  const dvLevel = positiveInteger(dovi?.dv_level);
  return dvLevel ? `${dvProfile}.${dvLevel}` : String(dvProfile);
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

function positiveInteger(value) {
  const number = Number.parseInt(value, 10);
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
