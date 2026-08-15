import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../crates/vs_web/static/js/core/registrations.js", import.meta.url),
  "utf8"
);
const {
  findRegistration,
  indexRegistration
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test("registration details correlate by stable endpoint id", () => {
  const registrations = new Map();
  const registration = {
    domain_id: "domain-a",
    endpoint_id: "42",
    number: "1001",
    state: "registered",
    contact: "<sip:1001@192.0.2.10:5060>"
  };

  indexRegistration(registrations, registration);

  assert.equal(
    findRegistration(registrations, "domain-a", {
      id: 42,
      number: "renamed-number"
    }),
    registration
  );
});

test("registration details fall back to number for legacy rows", () => {
  const registrations = new Map();
  const registration = {
    domain_id: "domain-a",
    endpoint_id: "",
    number: "1001",
    state: "registered"
  };

  indexRegistration(registrations, registration);

  assert.equal(
    findRegistration(registrations, "domain-a", {
      id: 7,
      number: "1001"
    }),
    registration
  );
});
