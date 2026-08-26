export const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 10_000;

export function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function retryDelayMs(
  response: Response,
  attempt: number,
  random: () => number = Math.random,
): number {
  const raw = response.headers.get("retry-after");
  if (raw) {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.min(asNumber * 1000, MAX_RETRY_AFTER_MS);
    }
    const when = Date.parse(raw);
    if (!Number.isNaN(when)) {
      return Math.min(Math.max(0, when - Date.now()), MAX_RETRY_AFTER_MS);
    }
  }
  const base = 100 * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(random() * 50);
  return Math.min(base + jitter, 2_000);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; maxAttempts?: number },
): Promise<Response> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (controller.signal.aborted) {
        throw abortError();
      }

      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        if (isAbortError(error)) throw abortError();
        throw error;
      }

      if (
        response.ok ||
        !shouldRetryStatus(response.status) ||
        attempt === maxAttempts
      ) {
        return response;
      }

      await response.body?.cancel().catch(() => undefined);
      await sleep(retryDelayMs(response, attempt), controller.signal);
    }

    throw new Error("HTTP retry exhausted.");
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
