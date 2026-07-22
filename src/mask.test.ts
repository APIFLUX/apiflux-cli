import { describe, expect, test } from "bun:test";
import { maskKey, maskKeysIn } from "./mask";

describe("maskKey", () => {
  test("masks any sk- key to sk-***", () => {
    expect(maskKey("sk-abcdef1234567890")).toBe("sk-***");
  });

  test("masks non-prefixed secrets entirely", () => {
    expect(maskKey("abcdef1234567890")).toBe("sk-***");
  });
});

describe("maskKeysIn", () => {
  test("replaces every occurrence of the key inside a message", () => {
    const key = "sk-abcdef1234567890";
    const msg = `request with ${key} failed; retried with ${key}`;
    expect(maskKeysIn(msg, key)).toBe("request with sk-*** failed; retried with sk-***");
  });

  test("also replaces the un-prefixed form of the key", () => {
    const key = "sk-abcdef1234567890";
    expect(maskKeysIn("raw abcdef1234567890 leaked", key)).toBe("raw sk-*** leaked");
  });
});
