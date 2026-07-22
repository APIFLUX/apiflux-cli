const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Normalize a base URL: strip trailing slashes, require https except for local hosts. */
export function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid base URL: ${JSON.stringify(input)}`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error(`Base URL must use https:// (got ${url.protocol}//${url.hostname})`);
  }
  return input.replace(/\/+$/, "");
}

/** Append /v1 exactly once, for OpenAI-compatible endpoints (Codex, generic SDK). */
export function withV1(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}
