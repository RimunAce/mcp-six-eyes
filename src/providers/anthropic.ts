import type { VisionProvider, VisionRequest, VisionResult } from "./types.js";

interface AnthropicOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
}

export class AnthropicProvider implements VisionProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(
      /\/$/,
      "",
    );
  }

  async analyze(request: VisionRequest): Promise<VisionResult> {
    if (!request.images.length) {
      throw new Error("At least one image is required.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const content: Array<Record<string, unknown>> = [];

      for (const image of request.images) {
        if (request.images.length > 1) {
          content.push({
            type: "text",
            text: `Image ${image.label}:`,
          });
        }
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: image.mimeType,
            data: image.base64,
          },
        });
      }

      content.push({
        type: "text",
        text: request.prompt,
      });

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          messages: [
            {
              role: "user",
              content,
            },
          ],
        }),
      });

      const payload = (await response.json()) as AnthropicResponse;
      if (!response.ok) {
        throw new Error(
          payload.error?.message ||
            `Anthropic API error (${response.status})`,
        );
      }

      const text = (payload.content ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim();

      if (!text) {
        throw new Error("Anthropic returned an empty vision response.");
      }

      return { text, provider: this.name, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}
