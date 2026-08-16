import type { LabeledImage } from "../image.js";

export type VisionTask =
  | "analyze"
  | "describe"
  | "ocr"
  | "compare"
  | "refer"
  | "ui"
  | "chart"
  | "diagram"
  | "extract";

export type { LabeledImage };

export interface VisionRequest {
  images: LabeledImage[];
  prompt: string;
  task: VisionTask;
  maxTokens?: number;
}

export interface VisionResult {
  text: string;
  provider: string;
  model: string;
  /** True when the result was served from the in-memory response cache. */
  cached?: boolean;
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  analyze(request: VisionRequest): Promise<VisionResult>;
}
