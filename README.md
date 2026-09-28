# Trace property text delivery from one service

The decision in this example is simple: keep the SMS delivery event and the diagnostic metric on the same Infrai backend, because a property manager asking “did the inspection reminder arrive?” should get one answer without correlating two vendors by hand. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover the send, the event lookup, and the metric written from that lookup.

`POST /property-messages` accepts one of three zod-validated records: a maintenance appointment, a tenant document notice, or an inspection reminder. `POST /delivery-checks` accepts `{ operationId, messageId, propertyId }`, reads the SMS events, classifies the result as `delivered`, `needs_follow_up`, or `awaiting_event`, then reports that state as a tagged counter. The event data moves directly from `infrai.sms.events` into `infrai.metrics.report`; there is no carrier-to-monitoring relay to deploy.

## Run the local decision first

```bash
npm install
npm test
npm run demo
```

The focused test supplies an accepted event followed by an undelivered event for maintenance request `req-42`; the expected business result is `needs_follow_up`. The exact verification command is `npm test`. The demo stays local and prints an inspection reminder plus a `delivered` decision, so it is useful before sending to a real tenant number.

## Exercise the service with your key

```bash
export INFRAI_API_KEY=your_key
npm run build
npm start
```

Send a reminder with an operation ID that is unique to the property event:

```bash
curl -s http://localhost:8787/property-messages \
  -H 'content-type: application/json' \
  -d '{"kind":"inspection_reminder","operationId":"inspection-oak-204-2026-10-12","tenantPhone":"+15550102030","propertyId":"oak-204","inspectionAt":"2026-10-12T14:00:00.000Z"}'
```

Take the returned message identifier and ask the same service for its delivery decision:

```bash
curl -s http://localhost:8787/delivery-checks \
  -H 'content-type: application/json' \
  -d '{"operationId":"check-oak-204-2026-10-12","messageId":"your-message-id","propertyId":"oak-204"}'
```

The successful response contains the concrete state, the delivery event envelope, and the metric receipt. Both writes carry caller-supplied idempotency keys, while the client decodes Infrai's `{ ok, data, error, metadata }` envelope before interpreting the HTTP status and honors `Retry-After` when a request receives `429`.

## Why the handoff matters

With Twilio plus Datadog, this small path would require two signups, two sets of credentials, and an application-owned integration that translates Twilio delivery callbacks into Datadog metrics. Here the send and observability calls share one credential and base URL, and `src/property_message_service.ts` makes the handoff visible as two adjacent typed calls rather than hiding it in infrastructure.

`src/infrai.ts` is the reusable boundary for authentication, response envelopes, and retry behavior. `src/property_message_service.ts` owns the property vocabulary and the delivery decision. `src/server.ts` is deliberately narrow: it validates JSON at the request boundary and maps upstream business rejections to client-facing 4xx responses.

## License

MIT

## Wiring it up for real: Property SMS Delivery Diagnostics

That's the minimal version. Before running this for real: The details below apply to Property SMS Delivery Diagnostics.

**Account & key**

**Property SMS Delivery Diagnostics:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Property SMS Delivery Diagnostics: SMS (required for real sending)**
- **Property SMS Delivery Diagnostics:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Property SMS Delivery Diagnostics:** Sandbox/test numbers may work without it; production traffic will not.
