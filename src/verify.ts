import { maskKeysIn } from "./mask";

export type VerifyResult =
  | { status: "ok"; modelCount: number }
  | { status: "unauthorized" }
  | { status: "network-error"; message: string };

/** Confirm the key works by listing models through the configured origin. */
export async function verifyKey(baseUrl: string, key: string): Promise<VerifyResult> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
    if (!response.ok) {
      return { status: "network-error", message: `unexpected HTTP ${response.status}` };
    }
    const body = (await response.json()) as { data?: unknown[] };
    return { status: "ok", modelCount: Array.isArray(body.data) ? body.data.length : 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "network-error", message: maskKeysIn(message, key) };
  }
}
