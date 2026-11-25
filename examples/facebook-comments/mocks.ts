/**
 * Mock read of the Meta Graph API Page post comments edge:
 *   GET /v27.0/{post-id}/comments
 *
 * Comments use `message` + `created_time` (`YYYY-MM-DDTHH:mm:ss+0000`).
 * The default order is oldest-first unless `order` is `reverse_chronological`.
 *
 * A valid call fails about half the time with the Graph errors this edge
 * returns (expired token, missing permission, Page rate limits, transient
 * outages, missing object). Invalid parameters still fail every time with
 * code 100.
 */

const GRAPH_VERSION = "v27.0";
const GRAPH_HOST = "https://graph.facebook.com";
const TRACE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fbtraceId = () => {
  let id = "A";
  for (let i = 0; i < 22; i++) {
    id +=
      TRACE_ALPHABET[Math.floor(Math.random() * TRACE_ALPHABET.length)] ?? "0";
  }
  return id;
};

export type GraphErrorType = "OAuthException" | "GraphMethodException";

type GraphErrorInit = {
  message: string;
  type: GraphErrorType;
  code: number;
  error_subcode?: number;
  is_transient?: boolean;
};

export class GraphApiError extends Error {
  readonly type: GraphErrorType;
  readonly code: number;
  readonly error_subcode?: number;
  /** Set on outages and request-limit errors the Graph docs say to retry. */
  readonly is_transient?: boolean;
  readonly fbtrace_id: string;

  constructor(init: GraphErrorInit) {
    super(init.message);
    this.name = "GraphApiError";
    this.type = init.type;
    this.code = init.code;
    if (init.error_subcode !== undefined) {
      this.error_subcode = init.error_subcode;
    }
    if (init.is_transient) this.is_transient = true;
    this.fbtrace_id = fbtraceId();
  }
}

const paramError = (message: string) =>
  new GraphApiError({
    message,
    type: "OAuthException",
    code: 100,
  });

const failHalfTheTime = (errors: readonly GraphErrorInit[]) => {
  if (Math.random() >= 0.5) return;
  const error = errors[Math.floor(Math.random() * errors.length)];
  if (!error) return;
  throw new GraphApiError(error);
};

const facebookRequestErrors = (postId: string): readonly GraphErrorInit[] => [
  {
    message:
      "Error validating access token: Session has expired on Friday, 14-Nov-25 16:00:00 PST. The current time is Wednesday, 25-Nov-26 10:00:00 PST.",
    type: "OAuthException",
    code: 190,
    error_subcode: 463,
  },
  {
    message:
      "Error validating access token: You cannot access the app till you log in to www.facebook.com and follow the instructions given.",
    type: "OAuthException",
    code: 190,
    error_subcode: 459,
  },
  {
    message:
      "(#200) Requires pages_read_engagement permission to manage the object",
    type: "OAuthException",
    code: 200,
  },
  {
    message:
      "(#80001) There have been too many calls to this Page account. Wait a bit and try again. For more info, please refer to https://developers.facebook.com/docs/graph-api/overview/rate-limiting.",
    type: "OAuthException",
    code: 80001,
  },
  {
    message: "(#4) Application request limit reached",
    type: "OAuthException",
    code: 4,
    is_transient: true,
  },
  {
    message:
      "An unexpected error has occurred. Please retry your request later.",
    type: "OAuthException",
    code: 2,
    is_transient: true,
  },
  {
    message: `Unsupported get request. Object with ID '${postId}' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api`,
    type: "GraphMethodException",
    code: 100,
    error_subcode: 33,
  },
];

export type GraphPaging = {
  cursors: {
    before: string;
    after: string;
  };
  previous?: string;
  next?: string;
};

export type FacebookComment = {
  created_time: string;
  from: {
    name: string;
    id: string;
  };
  message: string;
  id: string;
  like_count: number;
  comment_count: number;
  can_comment: boolean;
  can_reply_privately: boolean;
  permalink_url: string;
  /** Present on replies when `filter=stream`. Omitted for top-level comments. */
  parent?: {
    id: string;
  };
};

export type FacebookPostCommentsParams = {
  /** Default `toplevel`. `stream` flattens replies in time order and sets `parent`. */
  filter?: "toplevel" | "stream";
  /** Default `chronological` (oldest first). */
  order?: "chronological" | "reverse_chronological";
  /** When true, include `summary.total_count` for this filter. */
  summary?: boolean;
  /** Default 25. Graph rejects values outside 1..100. */
  limit?: number;
  after?: string;
  before?: string;
};

export type FacebookPostCommentsResponse = {
  data: FacebookComment[];
  paging?: GraphPaging;
  summary?: {
    order: "chronological" | "reverse_chronological";
    total_count: number;
    can_comment: boolean;
  };
};

type PageQuery = {
  limit?: number;
  after?: string;
  before?: string;
};

const encodeCursor = (edge: string, index: number) => btoa(`${edge}:${index}`);

const decodeCursor = (edge: string, cursor: string) => {
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw paramError("(#100) Invalid cursor.");
  }

  const prefix = `${edge}:`;
  const index = Number(
    decoded.startsWith(prefix) ? decoded.slice(prefix.length) : "",
  );
  if (!Number.isInteger(index) || index < 0) {
    throw paramError("(#100) Invalid cursor.");
  }
  return index;
};

const resolveLimit = (
  limit: number | undefined,
  max: number,
  fallback: number,
) => {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw paramError(
      `(#100) The limit parameter must be an integer between 1 and ${max}.`,
    );
  }
  return limit;
};

const edgeUrl = (
  path: string,
  fields: string,
  limit: number,
  cursor?: { name: "after" | "before"; value: string },
) => {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set(cursor.name, cursor.value);
  return url.toString();
};

const pageItems = <T>(
  items: readonly T[],
  query: PageQuery,
  options: {
    edge: string;
    path: string;
    fields: string;
    maxLimit: number;
    defaultLimit: number;
  },
): { data: T[]; paging?: GraphPaging } => {
  if (query.after !== undefined && query.before !== undefined) {
    throw paramError("(#100) Specify only one of after or before.");
  }

  const limit = resolveLimit(
    query.limit,
    options.maxLimit,
    options.defaultLimit,
  );

  let start = 0;
  if (query.after !== undefined) {
    start = decodeCursor(options.edge, query.after) + 1;
  } else if (query.before !== undefined) {
    const endBefore = decodeCursor(options.edge, query.before);
    start = Math.max(0, endBefore - limit);
  }

  const end = Math.min(
    query.before !== undefined
      ? decodeCursor(options.edge, query.before)
      : start + limit,
    items.length,
  );
  start = Math.min(start, items.length);

  const data = items.slice(start, end);
  if (data.length === 0) return { data };

  const before = encodeCursor(options.edge, start);
  const after = encodeCursor(options.edge, end - 1);
  const paging: GraphPaging = {
    cursors: { before, after },
  };

  if (start > 0) {
    paging.previous = edgeUrl(options.path, options.fields, limit, {
      name: "before",
      value: before,
    });
  }
  if (end < items.length) {
    paging.next = edgeUrl(options.path, options.fields, limit, {
      name: "after",
      value: after,
    });
  }

  return { data, paging };
};

type FacebookSeed = {
  localId: string;
  message: string;
  created_time: string;
  from: { name: string; id: string };
  like_count: number;
  /** Page-authored replies cannot be privately replied to. */
  pageAuthor: boolean;
  parentLocalId?: string;
};

const FACEBOOK_PAGE_NAME = "Northwind Coffee";

const facebookSeeds = (pageId: string): readonly FacebookSeed[] => [
  {
    localId: "201100000000001",
    created_time: "2026-11-20T14:02:11+0000",
    from: { name: "Maya Chen", id: "100058221934001" },
    message: "The caramel cloud latte looks incredible. Is it in the app yet?",
    like_count: 12,
    pageAuthor: false,
  },
  {
    localId: "201100000000002",
    created_time: "2026-11-20T15:18:44+0000",
    from: { name: FACEBOOK_PAGE_NAME, id: pageId },
    message: "Yes — it's under Seasonal starting today.",
    like_count: 3,
    pageAuthor: true,
    parentLocalId: "201100000000001",
  },
  {
    localId: "201100000000003",
    created_time: "2026-11-21T08:41:02+0000",
    from: { name: "Luis Ortega", id: "100067334120882" },
    message: "Grabbed one this morning. The oat milk option is the move.",
    like_count: 7,
    pageAuthor: false,
  },
  {
    localId: "201100000000004",
    created_time: "2026-11-22T11:05:37+0000",
    from: { name: "Priya Shah", id: "100072118903344" },
    message: "Can you share the calorie count for the small?",
    like_count: 2,
    pageAuthor: false,
  },
  {
    localId: "201100000000005",
    created_time: "2026-11-22T12:44:19+0000",
    from: { name: FACEBOOK_PAGE_NAME, id: pageId },
    message: "120 for the small, 180 for the medium.",
    like_count: 4,
    pageAuthor: true,
    parentLocalId: "201100000000004",
  },
];

const FACEBOOK_FIELDS =
  "id,message,created_time,from,like_count,comment_count,can_comment,can_reply_privately,permalink_url,parent";

const toFacebookComment = (
  postId: string,
  pageId: string,
  storyId: string | undefined,
  seed: FacebookSeed,
  seeds: readonly FacebookSeed[],
): FacebookComment => {
  const id = `${postId}_${seed.localId}`;
  const commentCount = seeds.filter(
    (candidate) => candidate.parentLocalId === seed.localId,
  ).length;
  const permalink = storyId
    ? `https://www.facebook.com/${pageId}/posts/${storyId}/?comment_id=${id}`
    : `https://www.facebook.com/${postId}/?comment_id=${id}`;

  const comment: FacebookComment = {
    created_time: seed.created_time,
    from: seed.from,
    message: seed.message,
    id,
    like_count: seed.like_count,
    comment_count: commentCount,
    can_comment: true,
    can_reply_privately: !seed.pageAuthor,
    permalink_url: permalink,
  };

  if (seed.parentLocalId) {
    comment.parent = { id: `${postId}_${seed.parentLocalId}` };
  }

  return comment;
};

/**
 * `GET /{post-id}/comments`
 *
 * `postId` is a Page post id (`{page-id}_{post-id}`). Comment ids come back as
 * `{post-id}_{comment-id}`. `filter=toplevel` (the Graph default) drops replies;
 * `filter=stream` returns every comment in time order with `parent` set.
 */
export const facebookPostComments = async (
  postId: string,
  params: FacebookPostCommentsParams = {},
): Promise<FacebookPostCommentsResponse> => {
  if (postId.trim() === "") {
    throw paramError("(#100) The parameter post_id is required.");
  }

  await sleep(40);
  failHalfTheTime(facebookRequestErrors(postId));

  const filter = params.filter ?? "toplevel";
  const order = params.order ?? "chronological";
  const separator = postId.indexOf("_");
  const pageId = separator === -1 ? postId : postId.slice(0, separator);
  const storyId = separator === -1 ? undefined : postId.slice(separator + 1);
  const seeds = facebookSeeds(pageId);

  const visible = seeds.filter((seed) =>
    filter === "stream" ? true : seed.parentLocalId === undefined,
  );
  const ordered =
    order === "reverse_chronological" ? [...visible].reverse() : visible;
  const comments = ordered.map((seed) =>
    toFacebookComment(postId, pageId, storyId, seed, seeds),
  );

  const page = pageItems(comments, params, {
    edge: `fb:${postId}:comments:${filter}:${order}`,
    path: `${postId}/comments`,
    fields: FACEBOOK_FIELDS,
    maxLimit: 100,
    defaultLimit: 25,
  });

  return {
    ...page,
    ...(params.summary
      ? {
          summary: {
            order,
            total_count: visible.length,
            can_comment: true,
          },
        }
      : {}),
  };
};
