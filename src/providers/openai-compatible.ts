import type { VisionProvider, VisionRequest, VisionResult } from "./types.js";

interface OpenAICompatOptions {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function extractText(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

export class OpenAICompatibleProvider implements VisionProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: OpenAICompatOptions) {
    this.name = options.name;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  async analyze(request: VisionRequest): Promise<VisionResult> {
    if (!request.images.length) {
      throw new Error("At least one image is required.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const content: Array<Record<string, unknown>> = [
        { type: "text", text: request.prompt },
      ];

      for (const image of request.images) {
        if (request.images.length > 1) {
          content.push({ type: "text", text: `Image ${image.label}:` });
        }
        content.push({
          type: "image_url",
          image_url: {
            url: image.dataUrl,
          },
        });
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...this.extraHeaders,
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

      const payload = (await response.json()) as ChatCompletionResponse;
      if (!response.ok) {
        throw new Error(
          payload.error?.message ||
            `${this.name} API error (${response.status})`,
        );
      }

      const text = extractText(payload);
      if (!text) {
        throw new Error(`${this.name} returned an empty vision response.`);
      }

      return { text, provider: this.name, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}
