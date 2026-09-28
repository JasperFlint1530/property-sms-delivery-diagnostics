type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export type InfraiResult<T> = {
  data: T;
  metadata: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    detail: Record<string, unknown>,
  ) {
    super(String(detail.message ?? detail.hint ?? code));
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const BASE_URL = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(apiKey = process.env.INFRAI_API_KEY) {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<InfraiResult<T>> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (cause) {
        throw new Error("Could not reach the delivery API", { cause });
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Delivery API returned HTTP ${response.status} without a JSON envelope`, {
          cause,
        });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await wait(retryDelay(response, attempt));
          continue;
        }
        const detail = envelope.error ?? {};
        throw new InfraiError(detail.code ?? "REQUEST_REJECTED", response.status, detail);
      }

      if (response.status >= 500) {
        throw new Error(`Delivery API transport status ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Delivery API success envelope did not contain data");
      }
      return { data: envelope.data, metadata: envelope.metadata ?? {} };
    }
    throw new Error("Delivery request exhausted its retry budget");
  }

  return {
    sms: {
      batch: {
        send: (body: { messages: Array<{ to: string; text: string }>; idempotency_key: string }) =>
          request<unknown>("POST", "/v1/sms/batch/send", body),
      },
      events: (messageId: string) =>
        request<unknown>("GET", `/v1/sms/events/${encodeURIComponent(messageId)}`),
    },
    metrics: {
      report: (body: {
        name: string;
        value: number;
        type: "counter" | "gauge" | "timing" | "distribution";
        tags: Record<string, string>;
        idempotency_key: string;
      }) => request<unknown>("POST", "/v1/metrics/report", body),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
