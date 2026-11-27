import { Effect } from "effect";

import { HttpClient, HttpClientResponse } from "effect/http";
import { FACEBOOK_PAGE_INSIGHT_METRICS } from "./constants";
import {
  FacebookPageInsightsResponseSchema,
  FacebookPostsResponseSchema,
  type FacebookPageAnalyticsQuery,
  type FacebookPageInsight,
  type FacebookPost,
} from "./facebook-types";

export const facebookAnalyticsApi = (http: HttpClient.HttpClient) => ({
  getPageAnalytics: (
    pageId: string,
    accessToken: string,
    query: FacebookPageAnalyticsQuery,
  ): Effect.Effect<ReadonlyArray<FacebookPageInsight>, Error> =>
    http
      .get(`/${pageId}/insights`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        urlParams: {
          metric: FACEBOOK_PAGE_INSIGHT_METRICS.join(","),
          period: query.period,
          since: query.since,
          until: query.until,
        },
      })
      .pipe(
        Effect.flatMap(
          HttpClientResponse.schemaBodyJson(FacebookPageInsightsResponseSchema),
        ),
        Effect.map((response) => response.data),
      ),

  getPostAnalytics: (
    postId: string,
    accessToken: string,
  ): Effect.Effect<ReadonlyArray<FacebookPost>, Error> =>
    http
      .get(`/${postId}/insights`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        urlParams: {
          fields: "id,message,created_time",
        },
      })
      .pipe(
        Effect.flatMap(
          HttpClientResponse.schemaBodyJson(FacebookPostsResponseSchema),
        ),
        Effect.map((response) => response.data),
      ),
});
