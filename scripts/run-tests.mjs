#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "test");
const files = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => path.join("test", name))
  .sort();

if (files.length === 0) {
  console.error("No test files found under test/*.test.mjs");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
