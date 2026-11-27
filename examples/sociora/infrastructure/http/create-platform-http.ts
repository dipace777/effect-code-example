import { HttpClient, HttpClientRequest } from "effect/http";

import { flow, Schedule } from "effect";

export const createPlatformHttp = (
  transport: HttpClient.HttpClient,
  baseUrl: string,
) =>
  transport.pipe(
    HttpClient.mapRequest(
      flow(HttpClientRequest.prependUrl(baseUrl), HttpClientRequest.acceptJson),
    ),

    HttpClient.filterStatusOk,

    HttpClient.retryTransient({
      schedule: Schedule.exponential(100),
      times: 3,
    }),
  );
