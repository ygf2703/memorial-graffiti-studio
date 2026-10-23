import test from "node:test";
import assert from "node:assert/strict";
import { compareReading } from "../server/review.mjs";
import { correctionInstruction } from "../server/correction.mjs";
import { muralPrompt } from "../server/prompt.mjs";
import { caption } from "../public/batch.js";

test("correct spelling never masks an overlapping, misplaced or unverified name", () => {
  const reading = { name: "גל בכר", caption, uncertain: false, flagPresent: true };
  for (const namePlacement of ["overlap", "not_above", "uncertain", undefined, "invalid"]) {
    const result = compareReading({ ...reading, namePlacement }, reading.name);
    assert.equal(result.status, "needs_review");
    assert.equal(result.nameMatches, true);
    assert.equal(result.namePlacement, ["overlap", "not_above"].includes(namePlacement) ? namePlacement : "uncertain");
  }
  assert.equal(compareReading({ ...reading, namePlacement: "clear_above" }, reading.name).status, "matched");
  assert.equal(compareReading({ ...reading, namePlacement: "clear_beside" }, reading.name).status, "matched");
});

test("large-name corrections preserve the full header and head safety gap", () => {
  assert.match(muralPrompt("seed", "גל בכר", false, true, true), /below y=356/);
  for (const reason of ["name", "portrait"]) {
    assert.match(correctionInstruction(reason, "גל בכר", true, true), /top 32%/);
    assert.doesNotMatch(correctionInstruction(reason, "גל בכר", true, true), /top 24%/);
    assert.match(correctionInstruction(reason, "גל בכר", true, true), /entire head, hair, face/);
    assert.match(correctionInstruction(reason, "גל בכר", true), /top 24%/);
  }
});
