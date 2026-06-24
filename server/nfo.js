import { readFile } from "node:fs/promises";

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
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
    return {
      title: tagValue(xml, "title"),
      originalTitle: tagValue(xml, "originaltitle"),
      year: tagValue(xml, "year") || tagValue(xml, "premiered").slice(0, 4),
      rating: normalizeRating(tagValue(xml, "rating") || tagValue(xml, "userrating")),
      runtime: normalizeRuntime(tagValue(xml, "runtime")),
      overview: tagValue(xml, "plot") || tagValue(xml, "outline")
    };
  } catch {
    return {};
  }
}

function normalizeRating(value) {
  if (!value) return "";
  const rating = Number.parseFloat(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "";
}

function normalizeRuntime(value) {
  if (!value) return "";
  return /^\d+$/.test(value) ? `${value} 分钟` : value;
}
