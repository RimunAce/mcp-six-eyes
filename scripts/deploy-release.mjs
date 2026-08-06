#!/usr/bin/env node
/**
 * One-shot release helper for mcp-six-eyes.
 *
 * Prerequisites:
 *   1. gh auth login
 *   2. npm login   (or NPM_TOKEN in the environment)
 *
 * Usage:
 *   node scripts/deploy-release.mjs
 *   node scripts/deploy-release.mjs --skip-npm
 *   node scripts/deploy-release.mjs --skip-github
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipNpm = args.has("--skip-npm");
const skipGithub = args.has("--skip-github");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;
const repo = "RimunAce/mcp-six-eyes";
const ghCandidates = [
  process.env.GH_PATH,
  path.join(process.env["ProgramFiles"] ?? "", "GitHub CLI", "gh.exe"),
  path.join(process.env["LocalAppData"] ?? "", "Programs", "GitHub CLI", "gh.exe"),
  "gh",
].filter(Boolean);

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function tryRun(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status ?? 1,
  };
}

function resolveGh() {
  for (const candidate of ghCandidates) {
    const probe = tryRun(candidate, ["--version"]);
    if (probe.ok) return candidate;
  }
  throw new Error("GitHub CLI (gh) not found. Install it, then re-run.");
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

function ensureGhAuth(gh) {
  const status = tryRun(gh, ["auth", "status"]);
  if (!status.ok) {
    throw new Error("Not logged into GitHub CLI. Run: gh auth login");
  }
  console.log(status.stdout || status.stderr || "gh auth ok");
}

function ensureRemote(gh) {
  const remote = tryRun("git", ["remote", "get-url", "origin"]);
  if (remote.ok) {
    console.log(`origin: ${remote.stdout}`);
    return;
  }

  const exists = tryRun(gh, ["repo", "view", repo, "--json", "name"]);
  if (!exists.ok) {
    console.log(`Creating public repo ${repo}...`);
    run(gh, [
      "repo",
      "create",
      repo,
      "--public",
      "--source=.",
      "--remote=origin",
      "--description",
      pkg.description,
    ]);
  } else {
    run("git", ["remote", "add", "origin", `https://github.com/${repo}.git`]);
  }
}

function ensureTag() {
  const existing = tryRun("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  if (existing.ok) {
    console.log(`Tag ${tag} already exists.`);
    return;
  }
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
}

function main() {
  console.log(`Deploying ${pkg.name}@${version}`);
  ensureCleanTree();
  run("npm", ["test"]);

  if (!skipGithub) {
    const gh = resolveGh();
    ensureGhAuth(gh);
    ensureRemote(gh);
    ensureTag();
    run("git", ["push", "-u", "origin", "main"]);
    run("git", ["push", "origin", tag]);
    console.log(`GitHub: https://github.com/${repo}`);
  } else {
    console.log("Skipping GitHub push (--skip-github).");
  }

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
