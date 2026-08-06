import type { VisionProvider, VisionRequest, VisionResult } from "./types.js";

interface GoogleOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

interface GoogleResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

export class GoogleProvider implements VisionProvider {
  readonly name = "google";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: GoogleOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.baseUrl = (
      options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/$/, "");
  }

  async analyze(request: VisionRequest): Promise<VisionResult> {
    if (!request.images.length) {
      throw new Error("At least one image is required.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const parts: Array<Record<string, unknown>> = [
        { text: request.prompt },
      ];

      for (const image of request.images) {
        if (request.images.length > 1) {
          parts.push({ text: `Image ${image.label}:` });
        }
        parts.push({
          inline_data: {
            mime_type: image.mimeType,
            data: image.base64,
          },
        });
      }

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 2048,
          },
        }),
      });

      const payload = (await response.json()) as GoogleResponse;
      if (!response.ok) {
        throw new Error(
          payload.error?.message || `Google API error (${response.status})`,
        );
      }

      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new Error("Google returned an empty vision response.");
      }

      return { text, provider: this.name, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}
