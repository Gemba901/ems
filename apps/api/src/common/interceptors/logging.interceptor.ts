import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const req    = context.switchToHttp().getRequest();
        const { method, url } = req;
        const start = Date.now();

        return next.handle().pipe(
            tap({
                next: () => {
                    const res = context.switchToHttp().getResponse();
                    this.logger.log(`${method} ${url} ${res.statusCode} +${Date.now() - start}ms`);
                },
                error: (err) => {
                    const status = err?.status ?? 500;
                    this.logger.warn(`${method} ${url} ${status} +${Date.now() - start}ms — ${err?.message}`);
                },
            }),
        );
    }
}
