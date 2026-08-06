import type { LabeledImage } from "./image.js";
import type { VisionTask } from "./providers/types.js";

const BASE_RULES = [
  "Be precise and concrete.",
  "If something is uncertain, say so.",
  "Do not invent text that is not visible.",
  "Prefer structured output when listing multiple items.",
].join(" ");

const MULTI_RULES = [
  "Images are labeled (Image 1, Image 2, or custom labels).",
  "Always refer to images by those exact labels.",
  "If a claim applies only to some images, name which ones.",
  "Do not mix details across images unless you are comparing them.",
].join(" ");

function inventoryBlock(images: LabeledImage[]): string {
  if (images.length <= 1) {
    return images.length === 1
      ? `This request includes Image ${images[0].label}.`
      : "";
  }
  const lines = images.map(
    (img) => `- Image ${img.label}: source=${img.source}; mime=${img.mimeType}`,
  );
  return [
    "Image inventory (use these labels in your answer):",
    ...lines,
    MULTI_RULES,
  ].join("\n");
}

export function buildPrompt(
  task: VisionTask,
  images: LabeledImage[],
  userPrompt?: string,
  options?: { schema?: string },
): string {
  const custom = userPrompt?.trim();
  const inventory = inventoryBlock(images);
  const multi = images.length > 1;

  const parts: string[] = [];

  switch (task) {
    case "ocr":
      parts.push(
        multi
          ? "Extract all readable text from each image separately."
          : "Extract all readable text from this image.",
        "Preserve reading order as much as possible.",
        "Keep original line breaks when they matter.",
        multi
          ? "Return a section per image label. If an image has no text, say so under that label."
          : "If no text is present, say so clearly.",
      );
      break;

    case "describe":
      parts.push(
        multi
          ? "Describe each image thoroughly for a text-only AI agent."
          : "Describe this image thoroughly for a text-only AI agent.",
        "Cover: overall scene, main subjects, layout, colors, UI elements, charts, diagrams, and any visible text.",
        "Call out details that would matter for debugging, design review, or answering follow-up questions.",
        multi
          ? "Use a separate section per image label, then a short cross-image summary if useful."
          : "",
      );
      break;

    case "compare":
      parts.push(
        "Compare the provided images.",
        "Cover similarities, differences, and what changed (content, layout, data, status, errors, styling).",
        "Be explicit about which label each observation belongs to.",
        "If images appear to be before/after, sequential steps, or variants, say so.",
        "End with a concise verdict of the most important differences.",
      );
      break;

    case "refer":
      parts.push(
        "Answer the user while grounding every visual claim in specific image labels.",
        'When the user says things like "image 1", "the second screenshot", or "both images", map that to the inventory labels.',
        "Quote or paraphrase only what is visible.",
        "If the referenced image does not support the claim, say that clearly.",
      );
      break;

    case "ui":
      parts.push(
        "Inspect the UI screenshot(s) for a text-only agent.",
        "Describe layout, hierarchy, components, states (loading/error/empty/success), and primary actions.",
        "Extract visible labels, copy, and error messages.",
        "Note accessibility/usability issues, inconsistencies, and likely bugs.",
        multi
          ? "If multiple screens are provided, explain flow/order and differences between them."
          : "",
      );
      break;

    case "chart":
      parts.push(
        "Read the chart, graph, plot, table, or dashboard.",
        "Identify chart type, axes, units, legends, series, and time range when visible.",
        "Extract key values, trends, outliers, and comparisons.",
        "If exact values are hard to read, give best-effort estimates and mark them as approximate.",
        multi
          ? "Compare series/insights across images when more than one is provided."
          : "",
      );
      break;

    case "diagram":
      parts.push(
        "Explain the diagram (architecture, flowchart, sequence, ERD, UML, mind map, whiteboard, etc.).",
        "Identify nodes/components, edges/relationships, direction of flow, and groupings.",
        "Summarize the system or process in plain language.",
        "Call out ambiguities, missing labels, or contradictions.",
        multi
          ? "If multiple diagrams are provided, relate them and note inconsistencies."
          : "",
      );
      break;

    case "extract":
      parts.push(
        "Extract structured information from the image(s).",
        "Return valid JSON only (no markdown fences) unless the user requests another format.",
        "Use null for unknown fields; do not invent values.",
        multi
          ? 'Include an "images" array or per-label objects so each image stays distinct.'
          : "",
        options?.schema?.trim()
          ? `Target schema / fields:\n${options.schema.trim()}`
          : "If no schema is given, choose a clear practical JSON shape for the visible content.",
      );
      break;

    case "analyze":
    default:
      parts.push(
        multi
          ? "Analyze the image(s) and answer the request."
          : "Analyze this image and answer the request.",
        "Include relevant visual evidence in your answer.",
        "If the image contains text, charts, UI, code, or errors, extract and interpret them.",
        multi
          ? "When multiple images are present, use labels and only combine facts when the question requires it."
          : "",
      );
      break;
  }

  parts.push(BASE_RULES);
  if (inventory) parts.push(inventory);

  if (task === "analyze" || task === "refer" || task === "compare") {
    parts.push(
      custom
        ? `User request: ${custom}`
        : task === "compare"
          ? "User request: Compare these images and summarize the important differences."
          : task === "refer"
            ? "User request: Explain what the referenced images show and how they relate."
            : "User request: Provide a useful analysis of what is shown.",
    );
  } else if (custom) {
    parts.push(
      task === "describe"
        ? `Focus especially on: ${custom}`
        : task === "extract"
          ? `Additional extraction instructions: ${custom}`
          : `Additional instructions: ${custom}`,
    );
  }

  return parts.filter(Boolean).join("\n");
}
