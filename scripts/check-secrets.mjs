#!/usr/bin/env node
/**
 * Fails if any tracked (or staged) file contains something that looks like a credential.
 * Runs in `npm test`, as `npm run check:secrets`, and from the pre-commit hook (.githooks/pre-commit).
 *
 *   node scripts/check-secrets.mjs           scan every tracked file
 *   node scripts/check-secrets.mjs --staged  scan only what is about to be committed
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SECRET_PATTERNS = [
  { name: "Google / Firebase API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI API key", re: /sk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Stripe live key", re: /\b[rs]k_live_[0-9A-Za-z]{20,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "Service account JSON", re: /"private_key_id"\s*:\s*"[0-9a-f]{20,}"/ },
];

/** Files that may never be committed at all, whatever they contain. */
const FORBIDDEN_FILES = [/(^|\/)\.env(\.(?!example$)[^/]+)?$/, /(^|\/)\.secret\.local$/, /serviceAccount.*\.json$/i];

export const isForbiddenFile = (file) => FORBIDDEN_FILES.some((re) => re.test(file));

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function scanText(text) {
  return SECRET_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

export function findSecrets({ staged = false } = {}) {
  const files = (staged ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]) : git(["ls-files"]))
    .split("\n")
    .filter(Boolean);
  const problems = [];
  for (const file of files) {
    if (isForbiddenFile(file)) {
      problems.push({ file, line: 0, kind: "file that must stay local (secrets / env)" });
      continue;
    }
    let text;
    try {
      text = staged ? git(["show", `:${file}`]) : fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue; // binary
    text.split("\n").forEach((line, i) => {
      for (const kind of scanText(line)) problems.push({ file, line: i + 1, kind });
    });
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const problems = findSecrets({ staged: process.argv.includes("--staged") });
  if (problems.length) {
    console.error("✖ Possible secrets found — not allowed in this repository:");
    for (const p of problems) console.error(`  ${p.file}${p.line ? `:${p.line}` : ""}  ${p.kind}`);
    console.error("Move them to .env.local / Firebase secrets (see .env.example and INSTRUCTIONS.md §7).");
    process.exit(1);
  }
  console.log("✔ No secrets found.");
}
