import { Effect, Schedule } from "effect";
import { startAiEmulator } from "../emulator";
import {
  callLLM,
  isLLMError,
  models,
  UnexpectedError,
  type LLMError,
  type Model,
} from "../llm";

const retryableTags = ["Timeout", "RateLimited", "Overloaded"] as const;

type RetryableError = Extract<
  LLMError,
  { _tag: (typeof retryableTags)[number] }
>;

const isRetryable = (error: LLMError): error is RetryableError =>
  (retryableTags as readonly string[]).includes(error._tag);

const isFallbackEligible = (
  error: LLMError,
): error is RetryableError | Extract<LLMError, { _tag: "ModelUnavailable" }> =>
  isRetryable(error) || error._tag === "ModelUnavailable";

const toLLMError = (model: Model, error: unknown): LLMError =>
  isLLMError(error)
    ? error
    : new UnexpectedError({
        model,
        message: error instanceof Error ? error.message : String(error),
      });

const callModel = (baseUrl: string, model: Model, prompt: string) =>
  Effect.tryPromise({
    try: () => callLLM(baseUrl, model, prompt),
    catch: (error) => toLLMError(model, error),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning(`${model} failed (${error._tag}): ${error.message}`),
    ),
  );

const callWithRetry = (baseUrl: string, model: Model, prompt: string) =>
  callModel(baseUrl, model, prompt).pipe(
    Effect.retry({
      while: isRetryable,
      times: 3,
      schedule: Schedule.exponential("100 millis"),
    }),
  );

const describeFinalFailure = (error: LLMError): string => {
  switch (error._tag) {
    case "InvalidPrompt":
    case "ContentFiltered":
      return `${error._tag} is permanent, so it was not retried: ${error.message}`;
    case "Unexpected":
      return `Unexpected failure from ${error.model}: ${error.message}`;
    default:
      return `${models.fallback} also failed (${error._tag}): ${error.message}`;
  }
};

const program = (baseUrl: string, prompt: string) =>
  callWithRetry(baseUrl, models.primary, prompt).pipe(
    Effect.catchIf(isFallbackEligible, (error) =>
      Effect.gen(function* () {
        const reason =
          error._tag === "ModelUnavailable"
            ? "model unavailable, skipping further retries"
            : "retries exhausted";
        yield* Effect.logInfo(
          `${models.primary} stopped (${error._tag}, ${reason}),
          switching to ${models.fallback}`,
        );
        return yield* callWithRetry(baseUrl, models.fallback, prompt);
      }),
    ),
    Effect.tapError((error) => Effect.logError(describeFinalFailure(error))),
  );

const ai = await startAiEmulator();

try {
  const response = await Effect.runPromise(
    program(ai.url, "Explain Effect TS"),
  );
  console.log(`Response (${response.model}):`, response.text);
} catch (error) {
  if (isLLMError(error)) {
    console.error(
      `Final error [${error._tag}] ${error.model}: ${error.message}`,
    );
  } else {
    console.error("Final error:", error);
  }
} finally {
  await ai.close();
}
