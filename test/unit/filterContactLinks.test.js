import { test } from "node:test";
import assert from "node:assert/strict";
import { filterContactLinks } from "../../services/forms.js";

test("keeps contact links, filters mailto/blog/bad URLs, dedupes, sorts by length", () => {
  const links = [
    "https://site.com/contact",
    "mailto:hello@site.com",
    "https://site.com/blog/contact-form-tips",
    "https://site.com/about",
    "https://site.com/get-in-touch",
    "https://site.com/contact-us/",
    "https://site.com/contact",
    "not a url",
    "ftp://weird",
  ];

  const result = filterContactLinks(links);

  assert.deepEqual(result, [
    "https://site.com/contact",
    "https://site.com/contact-us/",
    "https://site.com/get-in-touch",
  ]);
});

test("matches support/help/reach variants", () => {
  const links = [
    "https://site.com/support",
    "https://site.com/help",
    "https://site.com/reach-us",
    "https://site.com/team",
  ];
  assert.deepEqual(filterContactLinks(links), [
    "https://site.com/help",
    "https://site.com/support",
    "https://site.com/reach-us",
  ]);
});

test("returns empty array for empty input", () => {
  assert.deepEqual(filterContactLinks([]), []);
});

test("returns empty array when nothing matches", () => {
  assert.deepEqual(filterContactLinks(["https://site.com/about", "https://site.com/pricing"]), []);
});
