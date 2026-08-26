import type { AppConfig } from "./config.js";
import { VERSION } from "./version.js";

export function formatVisionStatus(
  config: AppConfig,
  info: { primary: string; fallback?: string },
): string {
  const roots = config.allowedRootsIsDefault
    ? "cwd + temp (default)"
    : (config.allowedRoots ?? []).join(", ") || "none";
  const cacheEntries = config.cacheMaxEntries;
  const retryAttempts = config.retryMaxAttempts ?? 3;
  const maxEdge = config.maxImageEdge ?? 2048;
  const privateBlock = config.blockPrivateUrls !== false;

  return [
    `mcp-six-eyes ${VERSION} is ready.`,
    `Primary: ${info.primary}`,
    info.fallback ? `Fallback: ${info.fallback}` : "Fallback: none",
    `Timeout: ${config.timeoutMs}ms`,
    `Max image bytes: ${config.maxImageBytes}`,
    `Max images per call: ${config.maxImages}`,
    `Max image edge: ${maxEdge} (detail=auto; low=512; original skips resize)`,
    `Allowed roots: ${roots}`,
    `Private URL block: ${privateBlock ? "on" : "off"}`,
    `Retry: ${retryAttempts} attempts on 429/5xx, honors Retry-After`,
    cacheEntries > 0
      ? `Cache: ${cacheEntries} entries; fallback results not cached so primary can recover`
      : "Cache: disabled",
    "",
    "Tools: analyze_image, describe_image, ocr_image, compare_images, refer_images, inspect_ui, read_chart, explain_diagram, extract_from_images, vision_status",
  ].join("\n");
}
