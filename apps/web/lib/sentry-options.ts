import type { ErrorEvent } from '@sentry/nextjs';

// Shared by the browser and server configs. Without NEXT_PUBLIC_SENTRY_DSN
// (local dev, tests) Sentry stays disabled. SDK v11 collects broadly by
// default: opt out of everything that can carry credentials or personal data.
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  beforeSend(event: ErrorEvent) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.query_string;
      if (event.request.headers) {
        for (const h of ['authorization', 'cookie', 'x-gemba-proxy-secret']) {
          delete event.request.headers[h];
        }
      }
    }
    return event;
  },
};
