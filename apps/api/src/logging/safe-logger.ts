import type { LoggerService } from "@nestjs/common";

type LogLevel = "log" | "error" | "warn" | "debug" | "verbose";

export class SafeLogger implements LoggerService {
  private write(level: LogLevel, message: unknown, context?: string): void {
    const safeMessage = typeof message === "string" ? this.redact(message).slice(0, 500) : "structured_event";
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event: safeMessage,
      ...(context ? { component: context.slice(0, 100) } : {}),
    });
    const output = level === "error" || level === "warn" ? process.stderr : process.stdout;
    output.write(`${record}\n`);
  }

  private redact(value: string): string {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
      .replace(/(authorization|cookie|password|secret|token)(["'=:\s]+)[^,\s"}]+/gi, "$1:[REDACTED]");
  }

  log(message: unknown, context?: string): void {
    this.write("log", message, context);
  }
  error(message: unknown, _trace?: string, context?: string): void {
    this.write("error", message, context);
  }
  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }
  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }
}
