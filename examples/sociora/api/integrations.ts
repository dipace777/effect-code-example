import { Effect } from "effect";

import { FetchHttpClient, HttpClient } from "effect/http";
import { createFacebookApi } from "../integrations/facebook";

const program1 = Effect.gen(function* () {
  // Get the shared HTTP transport once.
  const transport = yield* HttpClient.HttpClient;

  // Build platform clients from that same transport.
  const facebook = createFacebookApi(transport);
  //   const instagram = createInstagramApi(transport);

  // These credentials should come from your connected-account
  // records in your database, not global environment variables.
  const facebookToken = process.env.FACEBOOK_ACCESS_TOKEN!;
  //const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN!;

  // Fetch from different platforms.
  const facebookPosts = yield* facebook.posts.getPosts(
    "FACEBOOK_PAGE_ID",
    facebookToken,
  );

  return {
    facebookPosts,
    //instagramComments,
  };
});

const program2 = Effect.gen(function* () {
  // Get the shared HTTP transport once.
  const transport = yield* HttpClient.HttpClient;

  // Build platform clients from that same transport.
  const facebook = createFacebookApi(transport);
  //   const instagram = createInstagramApi(transport);

  // These credentials should come from your connected-account
  // records in your database, not global environment variables.
  const facebookToken = process.env.FACEBOOK_ACCESS_TOKEN!;

  // Fetch from different platforms.
  const facebookPageAnalytics = yield* facebook.analytics.getPageAnalytics(
    "FACEBOOK_PAGE_ID",
    facebookToken,
    {
      since: "2026-01-01",
      until: "2026-03-31",
      period: "day",
    },
  );

  return {
    facebookPageAnalytics,
  };
});

// Provide one shared HTTP transport.
const runnable = program1.pipe(Effect.provide(FetchHttpClient.layer));

Effect.runPromise(runnable).then(console.log).catch(console.error);
