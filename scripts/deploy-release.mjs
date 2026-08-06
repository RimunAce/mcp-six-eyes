#!/usr/bin/env node
/**
 * One-shot npm release helper for mcp-six-eyes.
 *
 * Prerequisites:
 *   npm login   (or NPM_TOKEN in the environment)
 *
 * Usage:
 *   node scripts/deploy-release.mjs
 *   node scripts/deploy-release.mjs --skip-npm
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipNpm = args.has("--skip-npm");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

function useShell(command) {
  // Absolute paths (especially with spaces) must not go through cmd.exe.
  return process.platform === "win32" && !path.isAbsolute(command);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: useShell(command),
    ...options,
  });
}

function tryRun(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    shell: useShell(command),
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status ?? 1,
  };
}

function ensureCleanTree() {
  const status = tryRun("git", ["status", "--porcelain"]);
  if (!status.ok) throw new Error(status.stderr || "git status failed");
  if (status.stdout) {
    throw new Error("Working tree is dirty. Commit or stash before release.");
  }
}

function ensureNpmAuth() {
  if (process.env.NPM_TOKEN) {
    console.log("Using NPM_TOKEN from environment.");
    return;
  }
  const whoami = tryRun("npm", ["whoami"]);
  if (!whoami.ok) {
    throw new Error("Not logged into npm. Run: npm login");
  }
  console.log(`npm user: ${whoami.stdout}`);
}

function main() {
  console.log(`Deploying ${pkg.name}@${version}`);
  ensureCleanTree();
  run("npm", ["test"]);

  if (!skipNpm) {
    ensureNpmAuth();
    run("npm", ["publish", "--access", "public"], {
      env: {
        ...process.env,
        ...(process.env.NPM_TOKEN
          ? { NODE_AUTH_TOKEN: process.env.NPM_TOKEN }
          : {}),
      },
    });
    console.log(`npm: https://www.npmjs.com/package/${pkg.name}`);
  } else {
    console.log("Skipping npm publish (--skip-npm).");
  }

  console.log("\nRelease complete.");
  console.log(`Clients can run: npx -y ${pkg.name}`);
}

try {
  main();
} catch (error) {
  console.error(`\nDeploy failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
