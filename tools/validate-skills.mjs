#!/usr/bin/env node
// Validates every skills/*/SKILL.md against the Agent Skills format.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
let failed = false;
const fail = (skill, msg) => {
  console.error(`✗ ${skill}: ${msg}`);
  failed = true;
};

for (const dir of fs.readdirSync(root)) {
  const file = path.join(root, dir, "SKILL.md");
  if (!fs.existsSync(file)) {
    fail(dir, "missing SKILL.md");
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) {
    fail(dir, "missing YAML frontmatter");
    continue;
  }
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(fm[1])?.[1]?.trim();
  const name = field("name");
  const description = field("description");
  if (name !== dir) fail(dir, `name "${name}" must equal folder name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name ?? "") || name.length > 64) fail(dir, "name must be lowercase-hyphenated, ≤64 chars");
  if (!description) fail(dir, "missing description");
  else if (description.length > 1024) fail(dir, `description is ${description.length} chars (max 1024)`);
  for (const ref of text.matchAll(/`((?:scripts|references)\/[\w.-]+)`/g)) {
    if (!fs.existsSync(path.join(root, dir, ref[1]))) fail(dir, `references missing file ${ref[1]}`);
  }
  if (!failed) console.log(`✓ ${dir}`);
}
process.exit(failed ? 1 : 0);
