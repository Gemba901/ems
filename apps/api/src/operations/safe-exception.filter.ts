import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTPError');
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          event: 'request_failed',
          requestId: response.getHeader('X-Request-Id'),
          status,
        }),
      );
    if (response.headersSent) {
      response.end();
      return;
    }
    response
      .status(status)
      .json(
        error instanceof HttpException
          ? error.getResponse()
          : { statusCode: 500, message: 'Internal server error' },
      );
  }
}
