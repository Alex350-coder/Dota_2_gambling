import type { AlertInput, AlertNotifier } from "@/domain/ports";
import type { Logger } from "@/platform/logger";

/**
 * Default `AlertNotifier` (T-912) — logs at `error` level with `alert: true` so a log-based
 * alerting rule (or a human grepping logs) can find it, matching the same "log now, wire a real
 * channel later" stopgap `settlementRunAlertEvent` already documents for the sweeper (T-612).
 */
export class LogAlertNotifier implements AlertNotifier {
  constructor(private readonly logger: Logger) {}

  notify(alert: AlertInput): Promise<void> {
    this.logger.error(alert.message, {
      alert: true,
      severity: alert.severity,
      code: alert.code,
      ...alert.details,
    });
    return Promise.resolve();
  }
}
