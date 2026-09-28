import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai.js";
import { inspectDelivery, sendPropertyMessage } from "./property_message_service.js";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const body = await readJson(request);
    const client = createInfraiClient();
    if (request.url === "/property-messages") {
      reply(response, 202, await sendPropertyMessage(client, body));
      return;
    }
    if (request.url === "/delivery-checks") {
      reply(response, 200, await inspectDelivery(client, body));
      return;
    }
    reply(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      reply(response, 400, { error: "Invalid request body", details: error.flatten() });
      return;
    }
    if (error instanceof SyntaxError) {
      reply(response, 400, { error: "Request body must be valid JSON" });
      return;
    }
    if (error instanceof InfraiError) {
      reply(response, clientStatus(error), { error: error.code, detail: error.detail });
      return;
    }
    reply(response, 502, {
      error: error instanceof Error ? error.message : "Upstream request failed",
    });
  }
}

const port = Number(process.env.PORT ?? 8787);
createServer((request, response) => void handleRequest(request, response)).listen(port, () => {
  console.log(`Property SMS service listening on http://localhost:${port}`);
});
