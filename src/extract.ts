import type { VisionResult } from "./providers/types.js";

export const EXTRACT_REPAIR_PROMPT =
  "Your previous response was not valid JSON. Return valid JSON only. No markdown fences, no commentary, no trailing text.";

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

export function tryParseJson(text: string): unknown {
  const stripped = stripJsonFence(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.search(/[{\[]/);
    if (start < 0) return undefined;
    try {
      return JSON.parse(stripped.slice(start));
    } catch {
      return undefined;
    }
  }
}

export async function completeExtract(
  first: VisionResult,
  retry: () => Promise<VisionResult>,
): Promise<{ ok: true; result: VisionResult } | { ok: false; message: string }> {
  const parsed = tryParseJson(first.text);
  if (parsed !== undefined) {
    return { ok: true, result: { ...first, text: JSON.stringify(parsed, null, 2) } };
  }

  const second = await retry();
  const repaired = tryParseJson(second.text);
  if (repaired !== undefined) {
    return {
      ok: true,
      result: { ...second, text: JSON.stringify(repaired, null, 2) },
    };
  }

  return {
    ok: false,
    message:
      "Vision extract failed: model did not return valid JSON after one repair attempt.",
  };
}
