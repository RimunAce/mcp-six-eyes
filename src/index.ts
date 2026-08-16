#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import { loadConfig, type AppConfig } from "./config.js";
import {
  loadLabeledImages,
  normalizeImageInputs,
  type ImageInput,
} from "./image.js";
import { buildPrompt } from "./prompts.js";
import { VisionRouter } from "./providers/index.js";
import type { VisionTask } from "./providers/types.js";

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

function formatResult(meta: {
  task: VisionTask;
  images: Array<{ label: string; source: string; mimeType: string }>;
  provider: string;
  model: string;
  text: string;
  cached?: boolean;
}): string {
  const imageLines =
    meta.images.length === 1
      ? [
          `- Image: ${meta.images[0].label}`,
          `- Source: ${meta.images[0].source}`,
          `- MIME: ${meta.images[0].mimeType}`,
        ]
      : [
          `- Images (${meta.images.length}):`,
          ...meta.images.map(
            (img) =>
              `  - ${img.label}: ${img.source} (${img.mimeType})`,
          ),
        ];

  return [
    `# Vision result (${meta.task})`,
    "",
    ...imageLines,
    `- Provider: ${meta.provider}`,
    `- Model: ${meta.model}`,
    ...(meta.cached ? ["- Cached: yes"] : []),
    "",
    meta.text,
  ].join("\n");
}

const sourceDescription =
  "Local file path, file:// URI, http(s) URL, data URL, or base64 image data";

const imageField = z.string().describe(sourceDescription);

const mimeTypeField = z
  .string()
  .optional()
  .describe(
    "Optional MIME type hint for a single bare-base64 `image` input, e.g. image/png",
  );

const imageObjectField = z.object({
  source: z.string().describe(sourceDescription),
  label: z
    .string()
    .optional()
    .describe(
      'Stable label the agent/user can refer to, e.g. "1", "2", "before", "after", "fig-a"',
    ),
  mimeType: z
    .string()
    .optional()
    .describe("Optional MIME type hint for bare base64 sources"),
});

const imagesField = z
  .array(z.union([z.string(), imageObjectField]))
  .min(1)
  .describe(
    'One or more images. Prefer this for multi-image chats: ["path/a.png", "path/b.png"] or [{source, label: "1"}, {source, label: "2"}]. Labels default to "1", "2", ...',
  );

const promptField = z
  .string()
  .optional()
  .describe("Optional extra instruction for the vision model");

const schemaField = z
  .string()
  .optional()
  .describe(
    'Optional JSON schema or field list for structured extraction, e.g. {"title":string,"total":number}',
  );

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseImagesArg(value: unknown): Array<string | ImageInput> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value as Array<string | ImageInput>;
}

async function main() {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mcp-six-eyes] Configuration error: ${message}`);
    process.exit(1);
  }

  const vision = new VisionRouter(config);
  const server = new McpServer({
    name: "mcp-six-eyes",
    version: "1.1.0",
  });

  async function runVisionTool(args: {
    image?: string;
    mimeType?: string;
    images?: Array<string | ImageInput>;
    prompt?: string;
    schema?: string;
    task: VisionTask;
    minImages?: number;
    maxTokens?: number;
  }) {
    try {
      const inputs = normalizeImageInputs({
        image: args.image,
        mimeType: args.mimeType,
        images: args.images,
      });

      if (args.minImages && inputs.length < args.minImages) {
        throw new Error(
          `This tool needs at least ${args.minImages} images (got ${inputs.length}).`,
        );
      }

      const loaded = await loadLabeledImages(inputs, {
        maxImageBytes: config.maxImageBytes,
        maxImages: config.maxImages,
        timeoutMs: config.timeoutMs,
      });

      const result = await vision.analyze({
        images: loaded,
        task: args.task,
        prompt: buildPrompt(args.task, loaded, args.prompt, {
          schema: args.schema,
        }),
        maxTokens: args.maxTokens,
      });

      return textResult(
        formatResult({
          task: args.task,
          images: loaded.map((img) => ({
            label: img.label,
            source: img.source,
            mimeType: img.mimeType,
          })),
          provider: result.provider,
          model: result.model,
          text: result.text,
          cached: result.cached,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mcp-six-eyes] ${args.task} failed: ${message}`);
      return textResult(`Vision ${args.task} failed: ${message}`, true);
    }
  }

  const singleOrMultiSchema = {
    image: imageField.optional(),
    mimeType: mimeTypeField,
    images: imagesField.optional(),
    prompt: promptField,
  };

  const multiPreferredSchema = {
    images: imagesField,
    image: imageField.optional(),
    mimeType: mimeTypeField,
    prompt: z
      .string()
      .optional()
      .describe(
        'What to compare or how to weigh differences (e.g. "focus on the error banner")',
      ),
  };

  server.registerTool(
    "analyze_image",
    {
      description:
        "Analyze one or more images with a vision model and return plain text. Use for general Q&A when the host model cannot see images. Supports single `image` or multi `images` (image 1, image 2, ...).",
      inputSchema: {
        ...singleOrMultiSchema,
        prompt: z
          .string()
          .optional()
          .describe(
            "What to analyze or answer (errors, UI review, chart meaning, differences, etc.)",
          ),
      },
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "analyze",
      }),
  );

  server.registerTool(
    "describe_image",
    {
      description:
        "Produce a detailed textual description of one or more images so a text-only model can reason about them. Prefer for general scene/UI understanding and multi-upload context dumps.",
      inputSchema: singleOrMultiSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "describe",
      }),
  );

  server.registerTool(
    "ocr_image",
    {
      description:
        "Extract readable text from one or more images (screenshots, documents, diagrams, error dialogs). Multi-image calls return a section per image label.",
      inputSchema: singleOrMultiSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "ocr",
      }),
  );

  server.registerTool(
    "compare_images",
    {
      description:
        'Compare two or more images and explain similarities/differences. Use for "compare image 1 and 2", before/after, A/B UI, design variants, or sequential screenshots.',
      inputSchema: multiPreferredSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "compare",
        minImages: 2,
      }),
  );

  server.registerTool(
    "refer_images",
    {
      description:
        'Answer a question that refers to specific uploads by label ("refer image 1 and 2", "only the second screenshot", "both figures"). Grounds every claim in image labels.',
      inputSchema: {
        images: imagesField,
        image: imageField.optional(),
        mimeType: mimeTypeField,
        prompt: z
          .string()
          .describe(
            'User question with image references, e.g. "Using image 1 and image 2, which button is primary?"',
          ),
      },
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "refer",
      }),
  );

  server.registerTool(
    "inspect_ui",
    {
      description:
        "Inspect UI screenshots: layout, components, states, copy, errors, and likely UX/accessibility issues. Accepts one screen or a multi-step flow.",
      inputSchema: singleOrMultiSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "ui",
      }),
  );

  server.registerTool(
    "read_chart",
    {
      description:
        "Read charts, graphs, plots, tables, and dashboards. Extracts axes, series, trends, and key values (marks estimates when exact pixels are unclear).",
      inputSchema: singleOrMultiSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "chart",
      }),
  );

  server.registerTool(
    "explain_diagram",
    {
      description:
        "Explain architecture diagrams, flowcharts, sequence diagrams, ERDs, UML, whiteboards, and similar figures for a text-only agent.",
      inputSchema: singleOrMultiSchema,
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        task: "diagram",
      }),
  );

  server.registerTool(
    "extract_from_images",
    {
      description:
        "Extract structured data (JSON) from one or more images: forms, receipts, IDs, tables, invoices, labels. Optional schema steers field names.",
      inputSchema: {
        ...singleOrMultiSchema,
        schema: schemaField,
        prompt: z
          .string()
          .optional()
          .describe("Extra extraction instructions (locale, currency, etc.)"),
      },
    },
    async (args) =>
      runVisionTool({
        image: asOptionalString(args.image),
        mimeType: asOptionalString(args.mimeType),
        images: parseImagesArg(args.images),
        prompt: asOptionalString(args.prompt),
        schema: asOptionalString(args.schema),
        task: "extract",
        maxTokens: 3072,
      }),
  );

  server.registerTool(
    "vision_status",
    {
      description:
        "Show which vision provider/model this MCP server is configured to use, plus image limits.",
      inputSchema: {},
    },
    async () => {
      const info = vision.info;
      return textResult(
        [
          "mcp-six-eyes is ready.",
          `Primary: ${info.primary}`,
          info.fallback ? `Fallback: ${info.fallback}` : "Fallback: none",
          `Timeout: ${config.timeoutMs}ms`,
          `Max image bytes: ${config.maxImageBytes}`,
          `Max images per call: ${config.maxImages}`,
          config.cacheMaxEntries > 0
            ? `Cache: ${config.cacheMaxEntries} entries`
            : "Cache: disabled",
          "",
          "Tools: analyze_image, describe_image, ocr_image, compare_images, refer_images, inspect_ui, read_chart, explain_diagram, extract_from_images, vision_status",
        ].join("\n"),
      );
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[mcp-six-eyes] running on stdio (${vision.info.primary}${vision.info.fallback ? ` | fallback ${vision.info.fallback}` : ""})`,
  );
}

main().catch((error) => {
  console.error(
    "[mcp-six-eyes] fatal:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
