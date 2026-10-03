import * as Sentry from '@sentry/nextjs';

export async function register() {
  // No routes use the edge runtime, so only the Node.js server needs Sentry.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sentryOptions } = await import('./lib/sentry-options');
    Sentry.init(sentryOptions);
  }
}

// Reports errors from server components, route handlers (including the API proxy) and server actions.
export const onRequestError = Sentry.captureRequestError;
