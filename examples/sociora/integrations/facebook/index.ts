import type { HttpClient } from "effect/http";
import { createPlatformHttp } from "../../infrastructure/http/create-platform-http";
import { facebookPostsApi } from "./facebook-posts";
import { FACEBOOK_API_BASE_URL } from "./constants";
import { facebookAnalyticsApi } from "./facebook-analytics";

export const createFacebookApi = (transport: HttpClient.HttpClient) => {
  const http = createPlatformHttp(transport, FACEBOOK_API_BASE_URL);

  return {
    posts: facebookPostsApi(http),
    analytics: facebookAnalyticsApi(http),
  };
};
