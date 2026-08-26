import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostLookup = (hostname: string) => Promise<string[]>;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata.goog",
  "metadata.azure.com",
  "metadata.gke.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const METADATA_IPS = new Set([
  "169.254.169.254",
  "169.254.169.253",
  "100.100.100.200",
  "fd00:ec2::254",
]);

export async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function isBlockedHostname(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  return host.endsWith(".localhost");
}

export function isBlockedIP(ip: string): boolean {
  const normalized = stripBrackets(ip).toLowerCase();
  if (METADATA_IPS.has(normalized)) return true;

  const mapped = ipv4Mapped(normalized);
  if (mapped) return isPrivateIPv4(mapped) || METADATA_IPS.has(mapped);

  if (isIP(normalized) === 4 || looksLikeIPv4(normalized)) {
    return isPrivateIPv4(normalized);
  }
  if (normalized.includes(":")) {
    return isPrivateIPv6(normalized);
  }
  return false;
}

export function hostnameToLiteralIPs(hostname: string): string[] {
  const host = stripBrackets(hostname);
  if (isIP(host) === 4 || isIP(host) === 6) return [host];
  const dotted = parseIPv4Like(host);
  return dotted ? [dotted] : [];
}

export async function assertPublicHttpUrl(
  raw: string,
  options: { lookup?: HostLookup } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid image URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked image URL protocol: ${url.protocol.replace(":", "")}`);
  }
  if (url.username || url.password) {
    throw new Error("Image URLs with embedded credentials are blocked.");
  }

  const host = stripBrackets(url.hostname);
  if (!host) {
    throw new Error("Image URL is missing a hostname.");
  }
  if (isBlockedHostname(host)) {
    throw new Error(`Blocked private or metadata host: ${host}`);
  }

  const literals = hostnameToLiteralIPs(host);
  const ips = literals.length
    ? literals
    : await (options.lookup ?? defaultLookup)(host);
  if (!ips.length) {
    throw new Error(`Could not resolve image host: ${host}`);
  }
  for (const ip of ips) {
    if (isBlockedIP(ip)) {
      throw new Error(`Blocked private or metadata address for host: ${host}`);
    }
  }
  return url;
}

export async function fetchPublicUrl(
  input: string,
  options: {
    timeoutMs: number;
    headers?: HeadersInit;
    blockPrivateUrls: boolean;
    lookup?: HostLookup;
    maxRedirects?: number;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    let current = input;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (options.blockPrivateUrls) {
        await assertPublicHttpUrl(current, { lookup: options.lookup });
      } else {
        let url: URL;
        try {
          url = new URL(current);
        } catch {
          throw new Error("Invalid image URL.");
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error(
            `Blocked image URL protocol: ${url.protocol.replace(":", "")}`,
          );
        }
      }

      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: options.headers ?? { Accept: "image/*,*/*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new Error("Redirect missing Location header.");
        }
        current = new URL(location, current).href;
        continue;
      }

      return response;
    }
    throw new Error("Too many redirects while fetching image.");
  } finally {
    clearTimeout(timer);
  }
}

function stripBrackets(value: string): string {
  return value.replace(/^\[|\]$/g, "");
}

function looksLikeIPv4(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function ipv4Mapped(ip: string): string | undefined {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice(7);
    if (rest.includes(".")) return rest;
  }
  return undefined;
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;
  return METADATA_IPS.has(ip);
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = stripBrackets(ip).toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = ipv4Mapped(lower);
  if (mapped) return isPrivateIPv4(mapped);
  const groups = expandIPv6(lower);
  if (!groups) return false;
  if (groups.every((g, i) => (i === 7 ? g === 1 : g === 0))) return true;
  if (groups.every((g) => g === 0)) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  return false;
}

function expandIPv6(ip: string): number[] | undefined {
  if (!ip.includes(":")) return undefined;
  if (ip.includes(".")) return undefined;
  const halves = ip.split("::");
  if (halves.length > 2) return undefined;

  const parseParts = (part: string): number[] | undefined => {
    if (!part) return [];
    const pieces = part.split(":");
    const nums = pieces.map((piece) => parseInt(piece, 16));
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) {
      return undefined;
    }
    return nums;
  };

  if (halves.length === 1) {
    const nums = parseParts(ip);
    return nums?.length === 8 ? nums : undefined;
  }

  const head = parseParts(halves[0]);
  const tail = parseParts(halves[1]);
  if (!head || !tail) return undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return undefined;
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function parseIPv4Like(host: string): string | undefined {
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return undefined;
    return dwordToIPv4(n);
  }

  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return undefined;
  const nums: number[] = [];
  for (const part of parts) {
    if (!part) return undefined;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^\d+$/.test(part)) n = parseInt(part, 10);
    else return undefined;
    if (!Number.isFinite(n) || n < 0) return undefined;
    nums.push(n);
  }

  if (nums.length === 1) {
    if (nums[0] > 0xffffffff) return undefined;
    return dwordToIPv4(nums[0]);
  }
  if (nums.length === 2) {
    if (nums[0] > 255 || nums[1] > 0xffffff) return undefined;
    return [nums[0], (nums[1] >>> 16) & 255, (nums[1] >>> 8) & 255, nums[1] & 255].join(
      ".",
    );
  }
  if (nums.length === 3) {
    if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xffff) return undefined;
    return [nums[0], nums[1], (nums[2] >>> 8) & 255, nums[2] & 255].join(".");
  }
  if (nums.some((n) => n > 255)) return undefined;
  return nums.join(".");
}

function dwordToIPv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
