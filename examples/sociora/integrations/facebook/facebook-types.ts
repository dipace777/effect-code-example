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

export const FACEBOOK_INSIGHT_PERIODS = [
  "day",
  "week",
  "days_28",
  "month",
  "lifetime",
  "total_over_range",
] as const;

export type FacebookInsightPeriod = (typeof FACEBOOK_INSIGHT_PERIODS)[number];

export type FacebookPageAnalyticsQuery = {
  readonly since: string;
  readonly until: string;
  readonly period: FacebookInsightPeriod;
};

const FacebookPageInsightValueSchema = Schema.Union([
  Schema.Number,
  Schema.Null,
  Schema.Record(
    Schema.String,
    Schema.Union([Schema.Number, Schema.Null]),
  ),
]);

export const FacebookPageInsightSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  period: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  values: Schema.Array(
    Schema.Struct({
      value: FacebookPageInsightValueSchema,
      end_time: Schema.optional(Schema.String),
    }),
  ),
});

export const FacebookPageInsightsResponseSchema = Schema.Struct({
  data: Schema.Array(FacebookPageInsightSchema),
});

export type FacebookPageInsight = typeof FacebookPageInsightSchema.Type;
