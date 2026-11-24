import { createEmulator } from "emulate";
import { models, requestTimeoutMillis } from "./llm";

// atlas-large is asked four times (the first call plus three retries):
// two 429s, one 503, then a reply slower than the client timeout.
// atlas-mini is rate limited once, then answers.
// "[blocked]" is filtered. "[unavailable]" fails the primary model once
// and skips the rest of its retries.
const slowResponseMillis = requestTimeoutMillis + 1_000;

const aiSeed = {
  ai: {
    strict: true,
    rules: [
      {
        id: "content-filter",
        match: { format: "openai-chat", textContains: "[blocked]" },
        reply: [{ type: "text", text: "" }],
        finish: "content_filter",
      },
      {
        id: "primary-unavailable",
        match: {
          format: "openai-chat",
          model: models.primary,
          textContains: "[unavailable]",
        },
        error: {
          status: 404,
          type: "invalid_request_error",
          code: "model_not_found",
          message: "Primary model is temporarily unavailable",
        },
      },
      {
        id: "primary-rate-limit",
        match: { format: "openai-chat", model: models.primary },
        times: 2,
        error: {
          status: 429,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
          message: "Primary model rate limit exceeded",
          headers: { "retry-after": "1" },
        },
      },
      {
        id: "primary-overloaded",
        match: { format: "openai-chat", model: models.primary },
        times: 1,
        error: {
          status: 503,
          type: "overloaded_error",
          message: "Primary model is overloaded",
        },
      },
      {
        id: "primary-slow",
        match: { format: "openai-chat", model: models.primary },
        times: 1,
        timing: { ttftMs: slowResponseMillis },
        reply: [
          {
            type: "text",
            text: "This reply arrives after the client gives up.",
          },
        ],
      },
      {
        id: "fallback-rate-limit",
        match: { format: "openai-chat", model: models.fallback },
        times: 1,
        error: {
          status: 429,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
          message: "Fallback model rate limit exceeded",
          headers: { "retry-after": "1" },
        },
      },
      {
        id: "fallback-answer",
        match: { format: "openai-chat", model: models.fallback },
        reply: [
          {
            type: "text",
            text: "Effect describes failures as typed data, then retries or falls back before the program runs.",
          },
        ],
      },
    ],
  },
};

export const startAiEmulator = () =>
  createEmulator({
    service: "ai",
    port: 0,
    seed: aiSeed,
  });
