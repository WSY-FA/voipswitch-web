import assert from "node:assert/strict";
import test from "node:test";
import {
  traceArrow,
  traceLeg,
  tracePeerAddress
} from "../crates/vs_web/static/js/views/runtime.js";

test("trace messages map to caller and callee lanes", () => {
  assert.equal(traceLeg({ session_id: "session-call-1-caller" }), "caller");
  assert.equal(traceLeg({ session_id: "session-call-1-callee" }), "callee");
  assert.equal(traceLeg({ session_id: null }), "caller");
});

test("trace arrows preserve SIP rx and tx direction", () => {
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-caller", direction: "rx" }),
    { left: 16.6667, width: 33.3333, reverse: false }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-caller", direction: "tx" }),
    { left: 16.6667, width: 33.3333, reverse: true }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-callee", direction: "tx" }),
    { left: 50, width: 33.3333, reverse: false }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-callee", direction: "rx" }),
    { left: 50, width: 33.3333, reverse: true }
  );
});

test("trace lane header uses the observed peer address", () => {
  const messages = [
    {
      session_id: "session-call-1-caller",
      direction: "rx",
      source_addr: "192.0.2.10:5060"
    },
    {
      session_id: "session-call-1-callee",
      direction: "tx",
      destination_addr: "198.51.100.20:5060"
    }
  ];
  assert.equal(tracePeerAddress(messages, "caller"), "192.0.2.10:5060");
  assert.equal(tracePeerAddress(messages, "callee"), "198.51.100.20:5060");
});
