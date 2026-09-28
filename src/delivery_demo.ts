import { decideDeliveryState, renderPropertyMessage } from "./property_message_service.js";

const request = {
  kind: "inspection_reminder" as const,
  operationId: "inspection-oak-204-2026-10-12",
  tenantPhone: "+15550102030",
  propertyId: "oak-204",
  inspectionAt: "2026-10-12T14:00:00.000Z",
};

const text = renderPropertyMessage(request);
const state = decideDeliveryState([{ status: "queued" }, { status: "delivered" }]);
console.log(JSON.stringify({ text, state }, null, 2));
