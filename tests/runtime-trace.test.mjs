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
  assert.equal(traceLeg({ session_id: null }), "unknown");
});

test("trace arrows preserve SIP rx and tx direction", () => {
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-caller", direction: "rx" }),
    { left: 16.6667, width: 33.3333, reverse: false, leg: "caller" }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-caller", direction: "tx" }),
    { left: 16.6667, width: 33.3333, reverse: true, leg: "caller" }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-callee", direction: "tx" }),
    { left: 50, width: 33.3333, reverse: false, leg: "callee" }
  );
  assert.deepEqual(
    traceArrow({ session_id: "session-call-1-callee", direction: "rx" }),
    { left: 50, width: 33.3333, reverse: true, leg: "callee" }
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

test("trace role uses the session suffix rather than words inside the call id", () => {
  assert.equal(traceLeg({ session_id: "session-callee-caller" }), "caller");
  for (const attempt of [1, 2, 12]) {
    const message = { session_id: `session-caller-callee-attempt-${attempt}`, direction: "rx" };
    assert.equal(traceLeg(message), "callee");
    assert.deepEqual(traceArrow(message), {
      left: 50, width: 33.3333, reverse: true, leg: "callee"
    });
  }
  for (const session_id of [null, "", "session-caller-unresolved", "session-callee-attempt-x"]) {
    assert.equal(traceLeg({ session_id }), "unknown");
    assert.equal(traceArrow({ session_id, direction: "rx" }), null);
    assert.equal(traceArrow({ session_id, direction: "tx" }), null);
  }
});

test("unknown SIP direction never implies tx or contributes a peer address", () => {
  for (const direction of [undefined, "", "other"]) {
    const message = { session_id: "session-call-caller", direction, destination_addr: "wrong" };
    assert.equal(traceArrow(message), null);
    assert.equal(tracePeerAddress([message], "caller"), "");
  }
  const messages = [
    { session_id: null, direction: "rx", source_addr: "unknown" },
    { session_id: "session-call-callee-attempt-2", direction: "rx", source_addr: "198.51.100.2:5060" },
    { session_id: "session-call-caller", direction: "tx", destination_addr: "192.0.2.1:5060" }
  ];
  assert.equal(tracePeerAddress(messages, "unknown"), "");
  assert.equal(tracePeerAddress(messages, "caller"), "192.0.2.1:5060");
  assert.equal(tracePeerAddress(messages, "callee"), "198.51.100.2:5060");
});
