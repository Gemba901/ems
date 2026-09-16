import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
const logger = new Logger('HTTP');
export function requestLogging(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.once('finish', () => {
    const context = req as Request & {
      tenant?: { organizationId: string };
      user?: { userId: string };
    };
    // Route templates omit query strings, raw identifiers, tokens and request bodies.
    const record = {
      event: 'http_request',
      requestId,
      method: req.method,
      route: req.route?.path ?? 'unmatched',
      status: res.statusCode,
      durationMs: Date.now() - start,
      tenantId: context.tenant?.organizationId,
      actorId: context.user?.userId,
    };
    if (res.statusCode >= 400) logger.warn(JSON.stringify(record));
    else logger.log(JSON.stringify(record));
  });
  next();
}
