import path from "node:path";
import { readdir } from "node:fs/promises";

export async function listMovieCategories(mediaRoot) {
  const entries = await safeReadDir(mediaRoot);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function collectLeafMovieFolders(folderPath) {
  const entries = await safeReadDir(folderPath);
  const childFolders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(folderPath, entry.name));

  if (childFolders.length === 0) return [folderPath];

  const leafFolders = [];
  for (const childFolder of childFolders) {
    leafFolders.push(...(await collectLeafMovieFolders(childFolder)));
  }
  return leafFolders;
}

export async function safeReadDir(targetPath) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
