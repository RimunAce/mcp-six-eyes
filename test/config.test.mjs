import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../build/config.js";
import { withEnv } from "./helpers.mjs";

const CLEAR_VISION_ENV = {
  VISION_PROVIDER: undefined,
  VISION_MODEL: undefined,
  VISION_BASE_URL: undefined,
  VISION_API_KEY: undefined,
  VISION_TIMEOUT_MS: undefined,
  VISION_MAX_IMAGE_BYTES: undefined,
  VISION_MAX_IMAGES: undefined,
  VISION_CACHE_MAX_ENTRIES: undefined,
  VISION_FALLBACK_PROVIDER: undefined,
  VISION_FALLBACK_MODEL: undefined,
  VISION_FALLBACK_BASE_URL: undefined,
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: undefined,
  OPENAI_BASE_URL: undefined,
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: undefined,
  GOOGLE_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  GEMINI_MODEL: undefined,
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_MODEL: undefined,
  OPENROUTER_BASE_URL: undefined,
};

describe("loadConfig", () => {
  it("loads OpenAI defaults", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-openai",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.provider, "openai");
        assert.equal(config.apiKey, "sk-test-openai");
        assert.equal(config.model, "gpt-4o-mini");
        assert.equal(config.timeoutMs, 60_000);
        assert.equal(config.maxImageBytes, 20 * 1024 * 1024);
        assert.equal(config.maxImages, 10);
        assert.equal(config.fallbackProvider, undefined);
      },
    );
  });

  it("accepts provider aliases and numeric overrides", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "Google",
        GOOGLE_API_KEY: "google-key",
        VISION_MODEL: "gemini-2.0-flash",
        VISION_TIMEOUT_MS: "45000",
        VISION_MAX_IMAGES: "4",
        VISION_MAX_IMAGE_BYTES: "1024",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.provider, "google");
        assert.equal(config.apiKey, "google-key");
        assert.equal(config.model, "gemini-2.0-flash");
        assert.equal(config.timeoutMs, 45_000);
        assert.equal(config.maxImages, 4);
        assert.equal(config.maxImageBytes, 1024);
      },
    );
  });

  it("configures openrouter base URL by default", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "or-key",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.provider, "openrouter");
        assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
        assert.equal(config.model, "openai/gpt-4o-mini");
      },
    );
  });

  it("requires VISION_BASE_URL for custom provider", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "custom",
        VISION_API_KEY: "custom-key",
      },
      () => {
        assert.throws(() => loadConfig(), /VISION_BASE_URL/);
      },
    );
  });

  it("loads custom provider with base URL", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "custom",
        VISION_API_KEY: "custom-key",
        VISION_BASE_URL: "https://llm.example/v1",
        VISION_MODEL: "vision-pro",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.provider, "custom");
        assert.equal(config.baseUrl, "https://llm.example/v1");
        assert.equal(config.model, "vision-pro");
      },
    );
  });

  it("loads fallback provider settings", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-primary",
        VISION_FALLBACK_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant-fallback",
        VISION_FALLBACK_MODEL: "claude-sonnet-4-5",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.fallbackProvider, "anthropic");
        assert.equal(config.fallbackApiKey, "sk-ant-fallback");
        assert.equal(config.fallbackModel, "claude-sonnet-4-5");
      },
    );
  });

  it("rejects unknown providers", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "watson",
        OPENAI_API_KEY: "sk-test",
      },
      () => {
        assert.throws(() => loadConfig(), /Unsupported VISION_PROVIDER/);
      },
    );
  });

  it("requires the primary API key", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
      },
      () => {
        assert.throws(() => loadConfig(), /OPENAI_API_KEY/);
      },
    );
  });

  it("defaults the response cache to 200 entries", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-openai",
      },
      () => {
        assert.equal(loadConfig().cacheMaxEntries, 200);
      },
    );
  });

  it("parses and disables VISION_CACHE_MAX_ENTRIES", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-openai",
        VISION_CACHE_MAX_ENTRIES: "42",
      },
      () => {
        assert.equal(loadConfig().cacheMaxEntries, 42);
      },
    );
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-openai",
        VISION_CACHE_MAX_ENTRIES: "0",
      },
      () => {
        assert.equal(loadConfig().cacheMaxEntries, 0);
      },
    );
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-openai",
        VISION_CACHE_MAX_ENTRIES: "nope",
      },
      () => {
        assert.equal(loadConfig().cacheMaxEntries, 200);
      },
    );
  });

  it("ignores invalid numeric overrides", () => {
    withEnv(
      {
        ...CLEAR_VISION_ENV,
        VISION_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant",
        VISION_TIMEOUT_MS: "nope",
        VISION_MAX_IMAGES: "-3",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.timeoutMs, 60_000);
        assert.equal(config.maxImages, 10);
      },
    );
  });
});
