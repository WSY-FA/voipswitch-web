import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChartPoints,
  validCdrSpoolLimits
} from "../crates/vs_web/static/js/views/system.js";

test("trend points preserve a fixed chart box", () => {
  const points = buildChartPoints([0, 50, 100], 100).split(" ");
  assert.equal(points.length, 3);
  assert.equal(points[0], "4.0,108.0");
  assert.equal(points[1], "160.0,56.0");
  assert.equal(points[2], "316.0,4.0");
});

test("trend points carry the previous value across missing samples", () => {
  assert.equal(
    buildChartPoints([25, null, 50], 100),
    "4.0,82.0 160.0,82.0 316.0,56.0"
  );
});

test("CDR spool limits require warning below resume below reject", () => {
  assert.equal(validCdrSpoolLimits(512, 800, 1024), true);
  assert.equal(validCdrSpoolLimits(800, 512, 1024), false);
  assert.equal(validCdrSpoolLimits(512, 1024, 1024), false);
});
