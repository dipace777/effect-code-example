import { Effect } from "effect";

import { HttpClient, HttpClientResponse } from "effect/http";
import {
  FacebookPostsResponseSchema,
  type FacebookPost,
} from "./facebook-types";

export const facebookPostsApi = (http: HttpClient.HttpClient) => ({
  getPosts: (
    pageId: string,
    accessToken: string,
  ): Effect.Effect<ReadonlyArray<FacebookPost>, Error> =>
    http
      .get(`/${pageId}/feed`, {
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
