import assert from "node:assert/strict";
import test from "node:test";
import { decideDeliveryState, renderPropertyMessage } from "../src/property_message_service.js";

test("a failed maintenance text becomes an explicit follow-up decision", () => {
  const text = renderPropertyMessage({
    kind: "maintenance_request",
    operationId: "maintenance-req-42",
    tenantPhone: "+15550102030",
    propertyId: "cedar-8b",
    requestId: "req-42",
    scheduledFor: "2026-10-03T09:30:00.000Z",
  });
  const state = decideDeliveryState([{ status: "accepted" }, { status: "undelivered" }]);

  assert.equal(
    text,
    "Maintenance req-42 at cedar-8b is scheduled for 2026-10-03T09:30:00.000Z.",
  );
  assert.equal(state, "needs_follow_up");
});

test("a delivery event closes the diagnostic decision", () => {
  assert.equal(decideDeliveryState({ events: [{ status: "delivered" }] }), "delivered");
});
