import type { Instrumentation } from "next";

import { captureError } from "@/lib/errors";

/** Every server error (pages, routes, actions) goes to Sentry when SENTRY_DSN is set. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await captureError(err, { path: request.path, method: request.method, route: context.routePath, routeType: context.routeType, ...(digest ? { digest } : {}) });
};
