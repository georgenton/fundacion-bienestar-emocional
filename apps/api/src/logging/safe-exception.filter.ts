import { ArgumentsHost, Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { SafeLogger } from "./safe-logger.js";

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger = new SafeLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = this.extractCode(exception, status);

    this.logger.warn(
      JSON.stringify({ event: "http_request_failed", method: request.method, path: request.path, status, code }),
      "Http",
    );
    response.status(status).json({ statusCode: status, code });
  }

  private extractCode(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "object" && response && "code" in response && typeof response.code === "string") {
        return response.code;
      }
    }
    return status === 500 ? "INTERNAL_ERROR" : `HTTP_${status}`;
  }
}
