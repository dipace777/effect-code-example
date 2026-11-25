import { Data } from "effect";

export class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly code: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class Transient extends Data.TaggedError("Transient")<{
  readonly code: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly code: number;
  readonly error_subcode?: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly code: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly code: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class InvalidRequest extends Data.TaggedError("InvalidRequest")<{
  readonly code: number;
  readonly message: string;
  readonly fbtrace_id: string;
}> {}

export class Unexpected extends Data.TaggedError("Unexpected")<{
  readonly message: string;
}> {}

export type GraphError =
  | RateLimited
  | Transient
  | Unauthorized
  | Forbidden
  | NotFound
  | InvalidRequest
  | Unexpected;

export type RetryableError = RateLimited | Transient;

export type Comment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likeCount: number;
  parentId?: string;
};

export type Collected = {
  comments: readonly Comment[];
  pages: number;
  failure?: GraphError;
};
