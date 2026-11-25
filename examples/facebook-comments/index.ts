import { Effect, Result } from "effect";
import { facebookPostComments } from "./mocks.ts";
import type { Collected } from "./types.ts";
import {
  describe,
  empty,
  toFacebookComment,
  toGraphError,
  withRetry,
} from "./utils.ts";

const FACEBOOK_POST_ID = "112233445566778_998877665544332";
const PAGE_SIZE = 2;
const MAX_PAGES = 10;

const collectFacebook = (after?: string, page = 1): Effect.Effect<Collected> =>
  Effect.gen(function* () {
    if (page > MAX_PAGES) {
      yield* Effect.logWarning(`facebook stopped after ${MAX_PAGES} pages`);
      return empty();
    }

    const fetched = yield* Effect.result(
      withRetry(
        Effect.tryPromise({
          try: () =>
            facebookPostComments(FACEBOOK_POST_ID, {
              filter: "stream",
              order: "chronological",
              limit: PAGE_SIZE,
              after,
            }),
          catch: (error) => toGraphError(error),
        }),
      ),
    );

    if (Result.isFailure(fetched)) return empty(fetched.failure);

    const comments = fetched.success.data.map(toFacebookComment);
    const next = fetched.success.paging?.next
      ? fetched.success.paging.cursors.after
      : undefined;
    if (next === undefined) {
      return { comments, pages: 1 };
    }

    const rest = yield* collectFacebook(next, page + 1);
    return {
      comments: [...comments, ...rest.comments],
      pages: 1 + rest.pages,
      ...(rest.failure ? { failure: rest.failure } : {}),
    };
  });

const program = Effect.gen(function* () {
  const result = yield* collectFacebook();

  if (result.failure) {
    const pages = result.pages === 1 ? "page" : "pages";
    const kept =
      result.comments.length === 0
        ? ""
        : ` Kept ${result.comments.length} comments from ${result.pages} ${pages}.`;
    yield* Effect.logError(`${describe(result.failure)}${kept}`);
  }

  return result;
});

const result = await Effect.runPromise(program);

const likes = result.comments.reduce(
  (sum, comment) => sum + comment.likeCount,
  0,
);
const replies = result.comments.filter((comment) => comment.parentId).length;
const pageLabel = result.pages === 1 ? "page" : "pages";
const replyLabel = replies === 1 ? "reply" : "replies";
console.log(
  `${result.comments.length} comments, ${result.pages} ${pageLabel}, ${replies} ${replyLabel}, ${likes} likes`,
);
for (const comment of result.comments) {
  const kind = comment.parentId ? "reply" : "comment";
  console.log(`  ${kind} ${comment.author}: ${comment.text}`);
}

if (result.comments.length === 0) {
  process.exitCode = 1;
}
