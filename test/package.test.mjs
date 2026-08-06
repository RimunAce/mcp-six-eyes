import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(".");

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(root, rel), "utf8"));
}

async function readText(rel) {
  return readFile(path.join(root, rel), "utf8");
}

describe("open source package surface", () => {
  it("has coherent package metadata for npm/npx", async () => {
    const pkg = await readJson("package.json");
    assert.equal(pkg.name, "mcp-six-eyes");
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.type, "module");
    assert.equal(pkg.author, "RimunAce");
    assert.equal(pkg.publishConfig?.access, "public");
    assert.ok(pkg.bin?.["mcp-six-eyes"]);
    assert.ok(pkg.files.includes("build"));
    assert.ok(pkg.files.includes("README.md"));
    assert.ok(pkg.files.includes("LICENSE"));
    assert.match(pkg.scripts.test, /scripts\/run-tests\.mjs/);
    assert.match(pkg.scripts["test:unit"], /scripts\/run-tests\.mjs/);
    assert.ok(pkg.engines?.node);
    assert.match(pkg.engines.node, /20/);
    assert.match(pkg.repository.url, /github\.com\/RimunAce\/mcp-six-eyes/);
    assert.match(pkg.bugs.url, /github\.com\/RimunAce\/mcp-six-eyes\/issues/);
    assert.match(pkg.homepage, /github\.com\/RimunAce\/mcp-six-eyes/);
  });

  it("ships MIT license under the current maintainer", async () => {
    const license = await readText("LICENSE");
    assert.match(license, /MIT License/);
    assert.match(license, /RimunAce/);
    assert.doesNotMatch(license, /mcp-visio/);
  });

  it("documents tools, security, contributing, and npx usage", async () => {
    const readme = await readText("README.md");
    for (const tool of [
      "analyze_image",
      "describe_image",
      "ocr_image",
      "compare_images",
      "refer_images",
      "inspect_ui",
      "read_chart",
      "explain_diagram",
      "extract_from_images",
      "vision_status",
    ]) {
      assert.match(readme, new RegExp(tool));
    }
    assert.match(readme, /npx -y mcp-six-eyes/);
    assert.match(readme, /github:RimunAce\/mcp-six-eyes/);
    assert.match(readme, /https:\/\/github\.com\/RimunAce\/mcp-six-eyes/);
    assert.match(readme, /## Security/);
    assert.match(readme, /## Contributing/);
    assert.match(readme, /npm test/);
    assert.doesNotMatch(readme, /Gojo|Satoru|—|OWNER/);
  });

  it("includes contributor and security docs", async () => {
    const contributing = await readText("CONTRIBUTING.md");
    const security = await readText("SECURITY.md");
    assert.match(contributing, /npm test/);
    assert.match(contributing, /github\.com\/RimunAce\/mcp-six-eyes/);
    assert.match(security, /Security/i);
    assert.match(security, /RimunAce\/mcp-six-eyes/);
  });

  it("keeps secrets out of git", async () => {
    const gitignore = await readText(".gitignore");
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^node_modules\/$/m);
    assert.match(gitignore, /^build\/$/m);
    assert.match(gitignore, /^coverage\/$/m);
  });

  it("ships CI and release workflows", async () => {
    const ci = await readText(".github/workflows/ci.yml");
    const release = await readText(".github/workflows/release.yml");
    assert.match(ci, /npm test/);
    assert.match(ci, /npm pack --dry-run/);
    assert.match(release, /npm publish --access public/);
    assert.match(release, /secrets\.NPM_TOKEN/);
  });
});
