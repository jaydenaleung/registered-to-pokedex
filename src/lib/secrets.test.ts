import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { findSecrets, isForbiddenFile, scanText } from "../../scripts/check-secrets.mjs";

describe("secret hygiene", () => {
  it("has no API keys or credentials in any tracked file", () => {
    expect(findSecrets()).toEqual([]);
  });

  it("recognises the kinds of keys this project uses", () => {
    expect(scanText(`apiKey: "AIza${"x".repeat(35)}"`)).toContain("Google / Firebase API key");
    expect(scanText(`ANTHROPIC_API_KEY=sk-ant-${"a".repeat(40)}`)).toContain("Anthropic API key");
    expect(scanText('apiKey: import.meta.env.VITE_FIREBASE_API_KEY')).toEqual([]);
  });

  it("refuses local env and secret files outright", () => {
    expect(isForbiddenFile(".env")).toBe(true);
    expect(isForbiddenFile(".env.local")).toBe(true);
    expect(isForbiddenFile(".env.production")).toBe(true);
    expect(isForbiddenFile("functions/.secret.local")).toBe(true);
    expect(isForbiddenFile(".env.example")).toBe(false);
  });
});
