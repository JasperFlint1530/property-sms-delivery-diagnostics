import { z } from "zod";
import type { InfraiClient } from "./infrai.js";

export const propertyMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("maintenance_request"),
    operationId: z.string().min(1),
    tenantPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    propertyId: z.string().min(1),
    requestId: z.string().min(1),
    scheduledFor: z.string().datetime(),
  }).strict(),
  z.object({
    kind: z.literal("tenant_document"),
    operationId: z.string().min(1),
    tenantPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    propertyId: z.string().min(1),
    documentName: z.string().min(1),
    portalPath: z.string().startsWith("/").min(2),
  }).strict(),
  z.object({
    kind: z.literal("inspection_reminder"),
    operationId: z.string().min(1),
    tenantPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    propertyId: z.string().min(1),
    inspectionAt: z.string().datetime(),
  }).strict(),
]);

export const deliveryCheckSchema = z.object({
  operationId: z.string().min(1),
  messageId: z.string().min(1),
  propertyId: z.string().min(1),
}).strict();

export type PropertyMessage = z.infer<typeof propertyMessageSchema>;
export type DeliveryCheck = z.infer<typeof deliveryCheckSchema>;
export type DeliveryState = "delivered" | "needs_follow_up" | "awaiting_event";

export function renderPropertyMessage(message: PropertyMessage): string {
  switch (message.kind) {
    case "maintenance_request":
      return `Maintenance ${message.requestId} at ${message.propertyId} is scheduled for ${message.scheduledFor}.`;
    case "tenant_document":
      return `${message.documentName} for ${message.propertyId} is ready in your tenant portal at ${message.portalPath}.`;
    case "inspection_reminder":
      return `Inspection reminder for ${message.propertyId}: ${message.inspectionAt}. Please secure pets and provide access.`;
  }
}

function eventStatuses(input: unknown): string[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && Array.isArray(Reflect.get(input, "events"))
      ? Reflect.get(input, "events") as unknown[]
      : [];
  return values.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const status = Reflect.get(item, "status");
    return typeof status === "string" ? [status.toLowerCase()] : [];
  });
}

export function decideDeliveryState(events: unknown): DeliveryState {
  const statuses = new Set(eventStatuses(events));
  if (statuses.has("delivered")) return "delivered";
  if (statuses.has("failed") || statuses.has("undelivered")) return "needs_follow_up";
  return "awaiting_event";
}

export async function sendPropertyMessage(infrai: InfraiClient, input: unknown) {
  const message = propertyMessageSchema.parse(input);
  const delivery = await infrai.sms.batch.send({
    messages: [{ to: message.tenantPhone, text: renderPropertyMessage(message) }],
    idempotency_key: message.operationId,
  });
  return { operationId: message.operationId, kind: message.kind, delivery };
}

export async function inspectDelivery(infrai: InfraiClient, input: unknown) {
  const check = deliveryCheckSchema.parse(input);
  const events = await infrai.sms.events(check.messageId);
  const state = decideDeliveryState(events.data);

  const metric = await infrai.metrics.report({
    name: "property_sms.delivery_check",
    value: 1,
    type: "counter",
    tags: {
      property_id: check.propertyId,
      delivery_state: state,
    },
    idempotency_key: `${check.operationId}:delivery-check`,
  });

  return {
    messageId: check.messageId,
    state,
    events,
    metric,
  };
}
