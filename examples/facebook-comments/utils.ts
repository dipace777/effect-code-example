import { Duration, Effect, Schedule } from "effect";
import { GraphApiError, type FacebookComment } from "./mocks.ts";
import {
  Forbidden,
  InvalidRequest,
  NotFound,
  RateLimited,
  Transient,
  Unauthorized,
  Unexpected,
  type Collected,
  type Comment,
  type GraphError,
  type RetryableError,
} from "./types.ts";

const retryableTags = ["RateLimited", "Transient"] as const;

const isRetryable = (error: GraphError): error is RetryableError =>
  (retryableTags as readonly string[]).includes(error._tag);

const isRateLimitCode = (code: number) =>
  code === 4 ||
  code === 17 ||
  code === 32 ||
  code === 613 ||
  (code >= 80_000 && code <= 80_014);

export const toGraphError = (error: unknown): GraphError => {
  if (!(error instanceof GraphApiError)) {
    return new Unexpected({
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const base = {
    code: error.code,
    message: error.message,
    fbtrace_id: error.fbtrace_id,
  };

  if (isRateLimitCode(error.code)) return new RateLimited(base);
  if (error.is_transient || error.code === 1 || error.code === 2) {
    return new Transient(base);
  }
  if (error.code === 190) {
    return new Unauthorized({ ...base, error_subcode: error.error_subcode });
  }
  if (error.code === 10 || error.code === 200 || error.code === 283) {
    return new Forbidden(base);
  }
  if (error.code === 100 && error.error_subcode === 33)
    return new NotFound(base);
  if (error.code === 100) return new InvalidRequest(base);
  return new Unexpected({ message: error.message });
};

export const describe = (error: GraphError) => {
  const code = "code" in error ? ` code ${error.code}` : "";
  const subcode =
    error._tag === "Unauthorized" && error.error_subcode !== undefined
      ? `/${error.error_subcode}`
      : "";
  const trace = "fbtrace_id" in error ? ` [${error.fbtrace_id}]` : "";
  const outcome =
    error._tag === "RateLimited" || error._tag === "Transient"
      ? "retries exhausted"
      : "permanent";
  return `${error._tag}${code}${subcode} (${outcome})${trace}: ${error.message}`;
};

const isRateLimitedInput = (input: unknown): input is RateLimited =>
  typeof input === "object" &&
  input !== null &&
  "_tag" in input &&
  input._tag === "RateLimited";

// Page business-use limits need a longer pause than a code 1/2 blip.
const retrySchedule = Schedule.exponential("80 millis").pipe(
  Schedule.modifyDelay(({ duration, input }) =>
    Effect.succeed(Duration.times(duration, isRateLimitedInput(input) ? 3 : 1)),
  ),
  Schedule.jittered,
);

export const withRetry = <A>(self: Effect.Effect<A, GraphError>) =>
  self.pipe(
    Effect.tapError((error) =>
      isRetryable(error)
        ? Effect.logWarning(
            `${error._tag} (code ${error.code}), retrying: ${error.message}`,
          )
        : Effect.void,
    ),
    Effect.retry({
      while: isRetryable,
      times: 4,
      schedule: retrySchedule,
    }),
  );

export const toFacebookComment = (comment: FacebookComment): Comment => ({
  id: comment.id,
  author: comment.from.name,
  text: comment.message,
  createdAt: comment.created_time,
  likeCount: comment.like_count,
  ...(comment.parent ? { parentId: comment.parent.id } : {}),
});

export const empty = (failure?: GraphError): Collected => ({
  comments: [],
  pages: 0,
  ...(failure ? { failure } : {}),
});
