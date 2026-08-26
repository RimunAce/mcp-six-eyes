import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  defaultAllowedRoots,
  expandUserPath,
  isPathInsideRoot,
  parseAllowedRoots,
  resolveSandboxedPath,
  splitRootList,
} from "../build/sandbox.js";
import { withTempDir, writeTempPng } from "./helpers.mjs";

describe("path sandbox", () => {
  it("splits colon/semicolon/comma lists and keeps Windows drives", () => {
    assert.deepEqual(splitRootList("/tmp:/var/tmp,/home/me"), [
      "/tmp",
      "/var/tmp",
      "/home/me",
    ]);
    assert.deepEqual(splitRootList("C:\\data;D:\\uploads"), [
      "C:\\data",
      "D:\\uploads",
    ]);
  });

  it("expands ~ to the home directory", () => {
    assert.equal(expandUserPath("~"), os.homedir());
    assert.equal(expandUserPath(path.join("~", "shots")), path.join(os.homedir(), "shots"));
  });

  it("defaults to cwd and temp", () => {
    const roots = defaultAllowedRoots();
    assert.ok(roots.some((root) => isPathInsideRoot(path.resolve(process.cwd()), root)));
    assert.ok(roots.some((root) => isPathInsideRoot(path.resolve(os.tmpdir()), root)));
  });

  it("parses VISION_ALLOWED_ROOTS", () => {
    const unset = parseAllowedRoots();
    assert.equal(unset.isDefault, true);
    const custom = parseAllowedRoots("/tmp,/var/tmp");
    assert.equal(custom.isDefault, false);
    assert.ok(custom.roots.length >= 1);
  });

  it("resolves allowed files and rejects outsiders", async () => {
    await withTempDir(async (allowed) => {
      const filePath = await writeTempPng(allowed, "ok.png");
      const resolved = await resolveSandboxedPath(filePath, [allowed]);
      assert.equal(path.resolve(resolved), path.resolve(filePath));

      await withTempDir(async (denied) => {
        const secret = await writeTempPng(denied, "secret.png");
        await assert.rejects(
          () => resolveSandboxedPath(secret, [allowed]),
          /outside VISION_ALLOWED_ROOTS/,
        );
      });
    });
  });
});
