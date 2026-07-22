export const MASKED = "sk-***";

export function maskKey(_key: string): string {
  return MASKED;
}

/**
 * Scrub every occurrence of the key (and its un-prefixed form) from a message.
 * Every user-visible error path must pass through this before printing.
 */
export function maskKeysIn(message: string, key: string): string {
  const bare = key.startsWith("sk-") ? key.slice(3) : key;
  return message.split(key).join(MASKED).split(bare).join(MASKED);
}
