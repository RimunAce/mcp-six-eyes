import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AnthropicProvider } from "../build/providers/anthropic.js";
import { GoogleProvider } from "../build/providers/google.js";
import { OpenAICompatibleProvider } from "../build/providers/openai-compatible.js";
import { VisionRouter } from "../build/providers/index.js";
import { labeledFixture, jsonResponse } from "./helpers.mjs";

function multiRequest(prompt = "compare them") {
  return {
    task: "compare",
    prompt,
    images: [labeledFixture("1", "a.png"), labeledFixture("2", "b.png")],
    maxTokens: 512,
  };
}

describe("OpenAICompatibleProvider", () => {
  it("posts multimodal chat completions with labeled images", async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        choices: [{ message: { content: "looks fine" } }],
      });
    };

    try {
      const provider = new OpenAICompatibleProvider({
        name: "openai",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1/",
        timeoutMs: 5_000,
        extraHeaders: { "X-Title": "mcp-six-eyes" },
      });

      const result = await provider.analyze(multiRequest());
      assert.equal(result.text, "looks fine");
      assert.equal(result.provider, "openai");
      assert.equal(result.model, "gpt-4o-mini");

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
      assert.equal(calls[0].init.headers["X-Title"], "mcp-six-eyes");

      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.model, "gpt-4o-mini");
      assert.equal(body.max_tokens, 512);
      assert.equal(body.messages[0].role, "user");
      const content = body.messages[0].content;
      assert.equal(content[0].type, "text");
      assert.equal(content[0].text, "compare them");
      assert.equal(content[1].text, "Image 1:");
      assert.equal(content[2].type, "image_url");
      assert.match(content[2].image_url.url, /^data:image\/png;base64,/);
      assert.equal(content[3].text, "Image 2:");
      assert.equal(content[4].type, "image_url");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("supports array content parts in responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "part-a " },
                { type: "text", text: "part-b" },
              ],
            },
          },
        ],
      });

    try {
      const provider = new OpenAICompatibleProvider({
        name: "custom",
        apiKey: "k",
        model: "m",
        baseUrl: "https://example.com/v1",
        timeoutMs: 5_000,
      });
      const result = await provider.analyze({
        task: "analyze",
        prompt: "hi",
        images: [labeledFixture()],
      });
      assert.equal(result.text, "part-a part-b");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws API and empty-response errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        jsonResponse({ error: { message: "quota exceeded" } }, 429);
      const provider = new OpenAICompatibleProvider({
        name: "openai",
        apiKey: "k",
        model: "m",
        baseUrl: "https://example.com/v1",
        timeoutMs: 5_000,
      });
      await assert.rejects(
        () =>
          provider.analyze({
            task: "analyze",
            prompt: "x",
            images: [labeledFixture()],
          }),
        /quota exceeded/,
      );

      globalThis.fetch = async () =>
        jsonResponse({ choices: [{ message: { content: "   " } }] });
      await assert.rejects(
        () =>
          provider.analyze({
            task: "analyze",
            prompt: "x",
            images: [labeledFixture()],
          }),
        /empty vision response/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("AnthropicProvider", () => {
  it("posts base64 images with labels then the prompt", async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        content: [{ type: "text", text: "anthropic ok" }],
      });
    };

    try {
      const provider = new AnthropicProvider({
        apiKey: "sk-ant",
        model: "claude-sonnet-4-5",
        timeoutMs: 5_000,
      });
      const result = await provider.analyze(multiRequest("diff these"));
      assert.equal(result.text, "anthropic ok");
      assert.equal(result.provider, "anthropic");

      assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
      assert.equal(calls[0].init.headers["x-api-key"], "sk-ant");
      assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");

      const body = JSON.parse(calls[0].init.body);
      const content = body.messages[0].content;
      assert.equal(content[0].text, "Image 1:");
      assert.equal(content[1].type, "image");
      assert.equal(content[1].source.type, "base64");
      assert.equal(content[1].source.media_type, "image/png");
      assert.equal(content[2].text, "Image 2:");
      assert.equal(content[3].type, "image");
      assert.equal(content[4].type, "text");
      assert.equal(content[4].text, "diff these");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("GoogleProvider", () => {
  it("posts generateContent with inline_data parts", async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: "gemini " }, { text: "ok" }] } },
        ],
      });
    };

    try {
      const provider = new GoogleProvider({
        apiKey: "google-key",
        model: "gemini-2.0-flash",
        timeoutMs: 5_000,
      });
      const result = await provider.analyze(multiRequest());
      assert.equal(result.text, "gemini ok");
      assert.equal(result.provider, "google");

      assert.match(
        calls[0].url,
        /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.0-flash:generateContent\?key=google-key/,
      );

      const body = JSON.parse(calls[0].init.body);
      const parts = body.contents[0].parts;
      assert.equal(parts[0].text, "compare them");
      assert.equal(parts[1].text, "Image 1:");
      assert.equal(parts[2].inline_data.mime_type, "image/png");
      assert.ok(parts[2].inline_data.data.length > 10);
      assert.equal(parts[3].text, "Image 2:");
      assert.equal(body.generationConfig.maxOutputTokens, 512);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("VisionRouter", () => {
  it("uses the primary provider on success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      jsonResponse({
        choices: [{ message: { content: "primary result" } }],
      });

    try {
      const router = new VisionRouter({
        provider: "openai",
        apiKey: "sk-primary",
        model: "gpt-4o-mini",
        timeoutMs: 5_000,
        maxImageBytes: 1_000_000,
        maxImages: 10,
      });

      assert.equal(router.info.primary, "openai/gpt-4o-mini");
      assert.equal(router.info.fallback, undefined);

      const result = await router.analyze({
        task: "analyze",
        prompt: "hi",
        images: [labeledFixture()],
      });
      assert.equal(result.text, "primary result");
      assert.equal(result.provider, "openai");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back when primary fails", async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      calls += 1;
      if (String(url).includes("openai.com")) {
        return jsonResponse({ error: { message: "primary down" } }, 500);
      }
      return jsonResponse({
        content: [{ type: "text", text: "fallback ok" }],
      });
    };

    try {
      const router = new VisionRouter({
        provider: "openai",
        apiKey: "sk-primary",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        timeoutMs: 5_000,
        maxImageBytes: 1_000_000,
        maxImages: 10,
        fallbackProvider: "anthropic",
        fallbackApiKey: "sk-ant",
        fallbackModel: "claude-sonnet-4-5",
      });

      assert.equal(router.info.fallback, "anthropic/claude-sonnet-4-5");

      const result = await router.analyze({
        task: "analyze",
        prompt: "hi",
        images: [labeledFixture()],
      });

      assert.equal(calls, 2);
      assert.match(result.text, /fallback ok/);
      assert.match(result.text, /primary provider failed/i);
      assert.equal(result.provider, "anthropic");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces combined errors when both providers fail", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      jsonResponse({ error: { message: "no capacity" } }, 503);

    try {
      const router = new VisionRouter({
        provider: "openai",
        apiKey: "sk-primary",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        timeoutMs: 5_000,
        maxImageBytes: 1_000_000,
        maxImages: 10,
        fallbackProvider: "anthropic",
        fallbackApiKey: "sk-ant",
        fallbackModel: "claude-sonnet-4-5",
      });

      await assert.rejects(
        () =>
          router.analyze({
            task: "analyze",
            prompt: "hi",
            images: [labeledFixture()],
          }),
        /Primary vision provider failed:[\s\S]*Fallback also failed/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
