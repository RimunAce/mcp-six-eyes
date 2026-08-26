import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeExtract,
  stripJsonFence,
  tryParseJson,
} from "../build/extract.js";

describe("extract JSON repair", () => {
  it("strips markdown fences", () => {
    assert.equal(stripJsonFence('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(stripJsonFence('```\n{"a":1}\n```'), '{"a":1}');
  });

  it("parses fenced and raw JSON", () => {
    assert.deepEqual(tryParseJson('```json\n{"total": 4}\n```'), { total: 4 });
    assert.deepEqual(tryParseJson("Here you go\n{\"ok\":true}"), { ok: true });
    assert.equal(tryParseJson("not json at all"), undefined);
  });

  it("returns parsed JSON without retry", async () => {
    let retries = 0;
    const completed = await completeExtract(
      { text: '```json\n{"merchant":"A"}\n```', provider: "openai", model: "m" },
      async () => {
        retries += 1;
        return { text: "{}", provider: "openai", model: "m" };
      },
    );
    assert.equal(completed.ok, true);
    assert.equal(retries, 0);
    assert.match(completed.result.text, /"merchant": "A"/);
  });

  it("retries once when the first payload is invalid", async () => {
    const completed = await completeExtract(
      { text: "sorry, here is prose", provider: "openai", model: "m" },
      async () => ({ text: '{"total":9}', provider: "openai", model: "m" }),
    );
    assert.equal(completed.ok, true);
    assert.match(completed.result.text, /"total": 9/);
  });

  it("returns a structured failure after a failed repair", async () => {
    const completed = await completeExtract(
      { text: "nope", provider: "openai", model: "m" },
      async () => ({ text: "still nope", provider: "openai", model: "m" }),
    );
    assert.equal(completed.ok, false);
    assert.match(completed.message, /valid JSON after one repair attempt/);
  });
});
