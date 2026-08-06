export type VisionProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "custom";

export interface AppConfig {
  provider: VisionProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  maxImageBytes: number;
  maxImages: number;
  fallbackProvider?: VisionProviderName;
  fallbackApiKey?: string;
  fallbackModel?: string;
  fallbackBaseUrl?: string;
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value.trim();
}

function optionalInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function normalizeProvider(raw: string | undefined): VisionProviderName {
  const value = (raw ?? "openai").trim().toLowerCase();
  if (
    value === "openai" ||
    value === "anthropic" ||
    value === "google" ||
    value === "openrouter" ||
    value === "custom"
  ) {
    return value;
  }
  throw new Error(
    `Unsupported VISION_PROVIDER "${raw}". Use openai, anthropic, google, openrouter, or custom.`,
  );
}

function defaultModel(provider: VisionProviderName): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "google":
      return "gemini-2.0-flash";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "custom":
      return "gpt-4o-mini";
  }
}

function apiKeyFor(provider: VisionProviderName, prefix = ""): string {
  const env = process.env;
  switch (provider) {
    case "openai":
      return required(
        `${prefix}OPENAI_API_KEY`,
        env[`${prefix}OPENAI_API_KEY`] ?? env.OPENAI_API_KEY,
      );
    case "anthropic":
      return required(
        `${prefix}ANTHROPIC_API_KEY`,
        env[`${prefix}ANTHROPIC_API_KEY`] ?? env.ANTHROPIC_API_KEY,
      );
    case "google":
      return required(
        `${prefix}GOOGLE_API_KEY`,
        env[`${prefix}GOOGLE_API_KEY`] ??
          env.GOOGLE_API_KEY ??
          env.GEMINI_API_KEY,
      );
    case "openrouter":
      return required(
        `${prefix}OPENROUTER_API_KEY`,
        env[`${prefix}OPENROUTER_API_KEY`] ??
          env.OPENROUTER_API_KEY ??
          env.OPENAI_API_KEY,
      );
    case "custom":
      return required(
        `${prefix}VISION_API_KEY`,
        env[`${prefix}VISION_API_KEY`] ??
          env.VISION_API_KEY ??
          env.OPENAI_API_KEY,
      );
  }
}

function modelFor(provider: VisionProviderName): string {
  const env = process.env;
  const explicit =
    env.VISION_MODEL ??
    env[`${provider.toUpperCase()}_MODEL`] ??
    (provider === "google" ? env.GEMINI_MODEL : undefined);
  return explicit?.trim() || defaultModel(provider);
}

function baseUrlFor(provider: VisionProviderName): string | undefined {
  const env = process.env;
  if (env.VISION_BASE_URL?.trim()) return env.VISION_BASE_URL.trim();
  if (provider === "openai" && env.OPENAI_BASE_URL?.trim()) {
    return env.OPENAI_BASE_URL.trim();
  }
  if (provider === "openrouter") {
    return env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
  }
  if (provider === "custom") {
    return required("VISION_BASE_URL", env.VISION_BASE_URL);
  }
  return undefined;
}

export function loadConfig(): AppConfig {
  const provider = normalizeProvider(process.env.VISION_PROVIDER);
  const fallbackRaw = process.env.VISION_FALLBACK_PROVIDER?.trim();

  const config: AppConfig = {
    provider,
    apiKey: apiKeyFor(provider),
    model: modelFor(provider),
    baseUrl: baseUrlFor(provider),
    timeoutMs: optionalInt(process.env.VISION_TIMEOUT_MS, 60_000),
    maxImageBytes: optionalInt(
      process.env.VISION_MAX_IMAGE_BYTES,
      20 * 1024 * 1024,
    ),
    maxImages: optionalInt(process.env.VISION_MAX_IMAGES, 10),
  };

  if (fallbackRaw) {
    const fallbackProvider = normalizeProvider(fallbackRaw);
    config.fallbackProvider = fallbackProvider;
    config.fallbackApiKey = apiKeyFor(fallbackProvider);
    config.fallbackModel =
      process.env.VISION_FALLBACK_MODEL?.trim() || defaultModel(fallbackProvider);
    config.fallbackBaseUrl =
      process.env.VISION_FALLBACK_BASE_URL?.trim() ||
      (fallbackProvider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : fallbackProvider === "custom"
          ? required("VISION_FALLBACK_BASE_URL", process.env.VISION_FALLBACK_BASE_URL)
          : process.env.OPENAI_BASE_URL?.trim());
  }

  return config;
}
