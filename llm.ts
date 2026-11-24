import { Data } from "effect";

export const models = {
  primary: "atlas-large",
  fallback: "atlas-mini",
} as const;

export type Model = (typeof models)[keyof typeof models];

export const requestTimeoutMillis = 400;

export interface LLMResponse {
  readonly model: Model;
  readonly text: string;
}

export class TimeoutError extends Data.TaggedError("Timeout")<{
  readonly model: Model;
  readonly message: string;
}> {}

export class RateLimitedError extends Data.TaggedError("RateLimited")<{
  readonly model: Model;
  readonly message: string;
  readonly retryAfterMillis: number;
}> {}

export class OverloadedError extends Data.TaggedError("Overloaded")<{
  readonly model: Model;
  readonly message: string;
}> {}

export class ModelUnavailableError extends Data.TaggedError(
  "ModelUnavailable",
)<{
  readonly model: Model;
  readonly message: string;
}> {}

export class InvalidPromptError extends Data.TaggedError("InvalidPrompt")<{
  readonly model: Model;
  readonly message: string;
}> {}

export class ContentFilteredError extends Data.TaggedError("ContentFiltered")<{
  readonly model: Model;
  readonly message: string;
}> {}

export class UnexpectedError extends Data.TaggedError("Unexpected")<{
  readonly model: Model;
  readonly message: string;
}> {}

export type LLMError =
  | TimeoutError
  | RateLimitedError
  | OverloadedError
  | ModelUnavailableError
  | InvalidPromptError
  | ContentFilteredError
  | UnexpectedError;

const llmErrorTags = new Set<LLMError["_tag"]>([
  "Timeout",
  "RateLimited",
  "Overloaded",
  "ModelUnavailable",
  "InvalidPrompt",
  "ContentFiltered",
  "Unexpected",
]);

export const isLLMError = (error: unknown): error is LLMError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof error._tag === "string" &&
  llmErrorTags.has(error._tag as LLMError["_tag"]);

const isModel = (value: unknown): value is Model =>
  value === models.primary || value === models.fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

interface ProviderError {
  readonly message: string;
  readonly type?: string;
  readonly code?: string;
}

const readProviderError = (body: unknown, status: number): ProviderError => {
  if (!isRecord(body) || !isRecord(body.error)) {
    return { message: `HTTP ${status}` };
  }

  const { message, type, code } = body.error;
  return {
    message: typeof message === "string" ? message : `HTTP ${status}`,
    ...(typeof type === "string" ? { type } : {}),
    ...(typeof code === "string" ? { code } : {}),
  };
};

const retryAfterMillis = (response: Response): number => {
  const header = response.headers.get("retry-after");
  if (header === null) return 0;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const date = Date.parse(header);
  if (Number.isNaN(date)) return 0;
  return Math.max(0, date - Date.now());
};

const failureFromStatus = (
  model: Model,
  response: Response,
  providerError: ProviderError,
): LLMError => {
  const { message, type, code } = providerError;

  if (response.status === 429) {
    return new RateLimitedError({
      model,
      message,
      retryAfterMillis: retryAfterMillis(response),
    });
  }

  if (
    response.status === 503 ||
    response.status === 529 ||
    type === "overloaded_error"
  ) {
    return new OverloadedError({ model, message });
  }

  if (response.status === 404 || code === "model_not_found") {
    return new ModelUnavailableError({ model, message });
  }

  if (
    response.status === 400 &&
    (code === "content_filter" || code === "content_policy_violation")
  ) {
    return new ContentFilteredError({ model, message });
  }

  if (response.status === 400) {
    return new InvalidPromptError({ model, message });
  }

  return new UnexpectedError({ model, message });
};

const completionFromBody = (model: Model, body: unknown): LLMResponse => {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new UnexpectedError({
      model,
      message: "Chat completion response was missing choices",
    });
  }

  const choice = body.choices[0];
  if (!isRecord(choice)) {
    throw new UnexpectedError({
      model,
      message: "Chat completion response was missing choices",
    });
  }

  if (choice.finish_reason === "content_filter") {
    throw new ContentFilteredError({
      model,
      message: "Prompt was rejected by the safety filter",
    });
  }

  const content = isRecord(choice.message) ? choice.message.content : undefined;
  if (typeof content !== "string") {
    throw new UnexpectedError({
      model,
      message: "Chat completion response was missing text",
    });
  }

  return {
    model: isModel(body.model) ? body.model : model,
    text: content,
  };
};

export async function callLLM(
  baseUrl: string,
  model: Model,
  prompt: string,
): Promise<LLMResponse> {
  if (prompt.trim().length === 0) {
    throw new InvalidPromptError({ model, message: "Prompt is empty" });
  }

  let response: Response;
  try {
    response = await fetch(new URL("/v1/chat/completions", baseUrl), {
      method: "POST",
      headers: {
        authorization: "Bearer test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(requestTimeoutMillis),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new TimeoutError({
        model,
        message: `Request timed out after ${requestTimeoutMillis}ms`,
      });
    }
    throw error;
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw failureFromStatus(model, response, readProviderError(body, response.status));
  }

  return completionFromBody(model, body);
}
