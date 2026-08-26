import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function splitRootList(raw: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === ";" || ch === ",") {
      if (current.trim()) chunks.push(current.trim());
      current = "";
      continue;
    }
    if (ch === ":") {
      const next = raw[i + 1];
      const trimmed = current.trim();
      const isDrive =
        /^[A-Za-z]$/.test(trimmed) &&
        (next === "\\" || next === "/" || next === undefined);
      if (isDrive) {
        current += ch;
        continue;
      }
      if (current.trim()) chunks.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

export function defaultAllowedRoots(): string[] {
  return uniqueResolved([process.cwd(), os.tmpdir()]);
}

export function parseAllowedRoots(raw?: string): {
  roots: string[];
  isDefault: boolean;
} {
  if (!raw?.trim()) {
    return { roots: defaultAllowedRoots(), isDefault: true };
  }
  const parts = splitRootList(raw);
  if (parts.length === 0) {
    return { roots: defaultAllowedRoots(), isDefault: true };
  }
  return { roots: uniqueResolved(parts), isDefault: false };
}

export function isPathInsideRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  if (rel === "") return true;
  if (path.isAbsolute(rel)) return false;
  const segments = rel.split(/[\\/]/);
  return !segments.includes("..");
}

export function assertResolvedInsideRoots(
  resolved: string,
  roots: string[],
): void {
  if (resolved.includes("\0")) {
    throw new Error("Image path contains an invalid null byte.");
  }
  if (roots.length === 0) {
    throw new Error("No VISION_ALLOWED_ROOTS configured.");
  }
  const ok = roots.some((root) => isPathInsideRoot(resolved, root));
  if (!ok) {
    throw new Error(`Image path is outside VISION_ALLOWED_ROOTS: ${resolved}`);
  }
}

export async function resolveSandboxedPath(
  input: string,
  roots: string[],
): Promise<string> {
  const resolved = path.resolve(expandUserPath(input));
  assertResolvedInsideRoots(resolved, roots);

  const real = await realpath(resolved);
  const realRoots: string[] = [];
  for (const root of roots) {
    try {
      realRoots.push(await realpath(root));
    } catch {
      realRoots.push(path.resolve(root));
    }
  }
  assertResolvedInsideRoots(real, realRoots);
  return real;
}

function uniqueResolved(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of paths) {
    const resolved = path.resolve(expandUserPath(value));
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}
