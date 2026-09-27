import { createLogger, type Logger } from "@/platform/logger";
import { MetricsRegistry } from "@/platform/metrics";
import { LogAlertNotifier } from "@/platform/alerts";
import type { Config } from "@/platform/config";

export interface Observability {
  readonly logger: Logger;
  readonly metrics: MetricsRegistry;
  readonly alertNotifier: LogAlertNotifier;
}

/** T-910/T-911/T-912 platform singletons — split out of `container.ts` purely to keep that file
 * under the repo's `max-lines` cap, same rationale as the other `container-*.ts` splits. */
export function buildObservability(config: Config): Observability {
  const logger = createLogger(config.LOG_LEVEL);
  return {
    logger,
    metrics: new MetricsRegistry(),
    alertNotifier: new LogAlertNotifier(logger),
  };
}
