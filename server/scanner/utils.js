import crypto from "node:crypto";

export function stableId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

export function slugify(value) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  return ascii || stableId(value);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length && !firstError) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = await mapper(items[index], index);
        } catch (error) {
          firstError ||= error;
        }
      }
    })
  );

  if (firstError) throw firstError;
  return results;
}
