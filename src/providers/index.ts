import type { AppConfig, VisionProviderName } from "../config.js";
import { VisionCache } from "../cache.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { VisionProvider, VisionRequest, VisionResult } from "./types.js";

export type { VisionProvider, VisionRequest, VisionResult, VisionTask } from "./types.js";

function createProvider(options: {
  name: VisionProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  retryMaxAttempts?: number;
}): VisionProvider {
  switch (options.name) {
    case "openai":
      return new OpenAICompatibleProvider({
        name: "openai",
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl ?? "https://api.openai.com/v1",
        timeoutMs: options.timeoutMs,
        retryMaxAttempts: options.retryMaxAttempts,
      });
    case "openrouter":
      return new OpenAICompatibleProvider({
        name: "openrouter",
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl ?? "https://openrouter.ai/api/v1",
        timeoutMs: options.timeoutMs,
        retryMaxAttempts: options.retryMaxAttempts,
        extraHeaders: {
          "HTTP-Referer": "https://www.npmjs.com/package/mcp-six-eyes",
          "X-Title": "mcp-six-eyes",
        },
      });
    case "custom":
      if (!options.baseUrl) {
        throw new Error("VISION_BASE_URL is required for custom provider.");
      }
      return new OpenAICompatibleProvider({
        name: "custom",
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl,
        timeoutMs: options.timeoutMs,
        retryMaxAttempts: options.retryMaxAttempts,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: options.apiKey,
        model: options.model,
        timeoutMs: options.timeoutMs,
        baseUrl: options.baseUrl,
        retryMaxAttempts: options.retryMaxAttempts,
      });
    case "google":
      return new GoogleProvider({
        apiKey: options.apiKey,
        model: options.model,
        timeoutMs: options.timeoutMs,
        baseUrl: options.baseUrl,
        retryMaxAttempts: options.retryMaxAttempts,
      });
  }
}

export class VisionRouter {
  private readonly primary: VisionProvider;
  private readonly fallback?: VisionProvider;
  private readonly cache: VisionCache;

  constructor(config: AppConfig) {
    this.cache = new VisionCache(config.cacheMaxEntries ?? 200);
    this.primary = createProvider({
      name: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      retryMaxAttempts: config.retryMaxAttempts,
    });

    if (config.fallbackProvider && config.fallbackApiKey) {
      this.fallback = createProvider({
        name: config.fallbackProvider,
        apiKey: config.fallbackApiKey,
        model: config.fallbackModel ?? config.model,
        baseUrl: config.fallbackBaseUrl,
        timeoutMs: config.timeoutMs,
        retryMaxAttempts: config.retryMaxAttempts,
      });
    }
  }

  get info(): { primary: string; fallback?: string } {
    return {
      primary: `${this.primary.name}/${this.primary.model}`,
      fallback: this.fallback
        ? `${this.fallback.name}/${this.fallback.model}`
        : undefined,
    };
  }

  async analyze(request: VisionRequest): Promise<VisionResult> {
    const key = this.cache.enabled ? this.cache.key(request) : undefined;
    if (key !== undefined) {
      const hit = this.cache.get(key);
      if (hit) {
        return { ...hit, cached: true };
      }
    }

    try {
      const result = await this.primary.analyze(request);
      if (key !== undefined) {
        this.cache.set(key, result);
      }
      return result;
    } catch (primaryError) {
      if (!this.fallback) throw primaryError;
      try {
        const result = await this.fallback.analyze(request);
        // Do not cache fallback hits: a later retry should still try primary.
        return {
          ...result,
          text: `${result.text}\n\n(Note: primary provider failed; used fallback ${result.provider}/${result.model}.)`,
        };
      } catch (fallbackError) {
        const primaryMessage =
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError);
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `Primary vision provider failed: ${primaryMessage}. Fallback also failed: ${fallbackMessage}`,
        );
      }
    }
  }
}
