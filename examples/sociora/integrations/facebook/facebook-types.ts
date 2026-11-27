import { Schema } from "effect";

export const FacebookPostSchema = Schema.Struct({
  id: Schema.String,
  message: Schema.optional(Schema.String),
  created_time: Schema.optional(Schema.String),
});

export const FacebookPostsResponseSchema = Schema.Struct({
  data: Schema.Array(FacebookPostSchema),
});

export type FacebookPost = typeof FacebookPostSchema.Type;
