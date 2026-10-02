import * as Sentry from '@sentry/nestjs';

// Loaded before anything else in main.ts. Without SENTRY_DSN (local dev,
// tests) Sentry stays disabled and sends nothing.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 0,
  // SDK v11 collects broadly by default. Opt out of everything that can carry
  // credentials or personal data; stack traces and source context still ship.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  // Requests can carry passwords, tokens and onboarding data: never ship bodies,
  // cookies, query strings or credential headers.
  beforeSend(event) {
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
});
