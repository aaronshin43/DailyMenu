export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = "ValidationError";
  }
}

export function jsonResponse(body: unknown, status = 200, retryAfterSeconds?: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
    },
  });
}

export async function withApiErrors(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse({ error: error.message }, error.status, error.retryAfterSeconds);
    }
    // Do not log request bodies, tokens, email addresses, or backend messages.
    console.error("Subscription API request failed.");
    return jsonResponse({ error: "Unable to process this request. Please try again later." }, 500);
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError("Send a JSON object.");

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024) {
        await reader.cancel();
        throw new ApiError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try {
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new ValidationError("Send valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Send a JSON object.");
  }
  return body as Record<string, unknown>;
}
