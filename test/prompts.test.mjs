import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPrompt } from "../build/prompts.js";
import { labeledFixture } from "./helpers.mjs";

describe("buildPrompt", () => {
  it("builds a single-image analyze prompt with the user request", () => {
    const prompt = buildPrompt("analyze", [labeledFixture("1")], "What failed?");
    assert.match(prompt, /Analyze this image/);
    assert.match(prompt, /User request: What failed\?/);
    assert.match(prompt, /Be precise and concrete/);
  });

  it("includes multi-image inventory and label rules", () => {
    const prompt = buildPrompt(
      "compare",
      [labeledFixture("1", "a.png"), labeledFixture("2", "b.png")],
      "focus on the banner",
    );
    assert.match(prompt, /Compare the provided images/);
    assert.match(prompt, /Image inventory/);
    assert.match(prompt, /Image 1: source=a\.png/);
    assert.match(prompt, /Image 2: source=b\.png/);
    assert.match(prompt, /Always refer to images by those exact labels/);
    assert.match(prompt, /User request: focus on the banner/);
  });

  it("uses task defaults when no custom prompt is given", () => {
    const compare = buildPrompt("compare", [
      labeledFixture("before"),
      labeledFixture("after"),
    ]);
    assert.match(compare, /summarize the important differences/);

    const refer = buildPrompt("refer", [
      labeledFixture("1"),
      labeledFixture("2"),
    ]);
    assert.match(refer, /referenced images show/);
  });

  it("specializes OCR, describe, UI, chart, diagram tasks", () => {
    const images = [labeledFixture("1")];
    assert.match(buildPrompt("ocr", images), /Extract all readable text/);
    assert.match(buildPrompt("describe", images), /Describe this image thoroughly/);
    assert.match(buildPrompt("ui", images), /Inspect the UI screenshot/);
    assert.match(buildPrompt("chart", images), /Read the chart/);
    assert.match(buildPrompt("diagram", images), /Explain the diagram/);
  });

  it("asks for per-label OCR sections on multi-image input", () => {
    const prompt = buildPrompt("ocr", [
      labeledFixture("1"),
      labeledFixture("2"),
    ]);
    assert.match(prompt, /section per image label/i);
  });

  it("embeds extract schema and JSON-only guidance", () => {
    const prompt = buildPrompt(
      "extract",
      [labeledFixture("receipt")],
      "use USD",
      { schema: '{"total":number}' },
    );
    assert.match(prompt, /Return valid JSON only/);
    assert.match(prompt, /Target schema/);
    assert.match(prompt, /"total":number/);
    assert.match(prompt, /Additional extraction instructions: use USD/);
  });

  it("keeps refer grounding instructions", () => {
    const prompt = buildPrompt(
      "refer",
      [labeledFixture("1"), labeledFixture("2")],
      "Which CTA is stronger in image 1?",
    );
    assert.match(prompt, /grounding every visual claim/i);
    assert.match(prompt, /image 1/);
  });
});
