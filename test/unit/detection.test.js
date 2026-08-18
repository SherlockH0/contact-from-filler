import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUCCESS_PHRASES,
  isSubmissionSuccessText,
  computeSignals,
} from "../../services/detection.js";

test("SUCCESS_PHRASES are all lowercase phrases", () => {
  assert.ok(SUCCESS_PHRASES.length > 0);
  for (const p of SUCCESS_PHRASES) {
    assert.equal(p, p.toLowerCase(), `phrase "${p}" should be lowercase`);
  }
});

test("isSubmissionSuccessText matches success confirmations", () => {
  const positives = [
    "Thank you for contacting us",
    "Your message has been sent",
    "We received your inquiry",
    "Message sent!",
    "Successfully submitted",
    "We will contact you soon",
    "thank YOU!",
  ];
  for (const text of positives) {
    assert.ok(isSubmissionSuccessText(text), `should match: ${text}`);
  }
});

test("isSubmissionSuccessText does not match unrelated text", () => {
  const negatives = ["", "hello world", "the weather today", "contact us anytime", "404 not found", null, undefined, 42];
  for (const text of negatives) {
    assert.ok(!isSubmissionSuccessText(text), `should not match: ${JSON.stringify(text)}`);
  }
});

test("computeSignals: no signals -> not submitted, confidence 0", () => {
  const { submitted, confidence, signals } = computeSignals({});
  assert.equal(submitted, false);
  assert.equal(confidence, 0);
  assert.deepEqual(signals, {
    networkOk: false,
    urlChanged: false,
    formGone: false,
    happyText: false,
    isThankYouPage: false,
  });
});

test("computeSignals: single signal -> submitted, confidence 1", () => {
  const { submitted, confidence, signals } = computeSignals({ happyText: true });
  assert.equal(submitted, true);
  assert.equal(confidence, 1);
  assert.equal(signals.happyText, true);
});

test("computeSignals: multiple signals -> confidence counts them", () => {
  const { submitted, confidence, signals } = computeSignals({
    networkOk: true,
    isThankYouPage: true,
  });
  assert.equal(submitted, true);
  assert.equal(confidence, 2);
  assert.equal(signals.networkOk, true);
  assert.equal(signals.isThankYouPage, true);
});
