import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry-options';

Sentry.init(sentryOptions);

// Next.js navigation hook; only records anything if tracing is turned on later.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
