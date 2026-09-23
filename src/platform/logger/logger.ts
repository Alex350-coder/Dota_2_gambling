import pino from "pino";
import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEvent {
  readonly requestId?: string;
  readonly route?: string;
  readonly userId?: string | null;
  readonly durationMs?: number;
  readonly outcome?: string;
  readonly [key: string]: unknown;
}

/** OBSERVABILITY.md §2 — pino, JSON, one line per event. `debug` is local-only; production
 * config should never set `LOG_LEVEL=debug` (a review concern, not enforced here). */
export interface Logger {
  debug(message: string, event?: LogEvent): void;
  info(message: string, event?: LogEvent): void;
  warn(message: string, event?: LogEvent): void;
  error(message: string, event?: LogEvent): void;
  /** Binds fields (e.g. `requestId`) that every subsequent call on the returned logger includes. */
  child(bindings: LogEvent): Logger;
}

class PinoLogger implements Logger {
  constructor(private readonly instance: pino.Logger) {}

  debug(message: string, event: LogEvent = {}): void {
    this.instance.debug(redact(event), message);
  }

  info(message: string, event: LogEvent = {}): void {
    this.instance.info(redact(event), message);
  }

  warn(message: string, event: LogEvent = {}): void {
    this.instance.warn(redact(event), message);
  }

  error(message: string, event: LogEvent = {}): void {
    this.instance.error(redact(event), message);
  }

  child(bindings: LogEvent): Logger {
    return new PinoLogger(this.instance.child(redact(bindings) as Record<string, unknown>));
  }
}

export function createLogger(level: LogLevel): Logger {
  return new PinoLogger(pino({ level }));
}
