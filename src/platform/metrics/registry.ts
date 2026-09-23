/**
 * Minimal in-process metrics registry (T-911, OBSERVABILITY.md §3). Counters and histograms are
 * labelled by a small fixed set of dimensions (e.g. `{route, status}`), matching Prometheus'
 * label model without pulling in a client library — this app is a single Next.js process, not a
 * multi-replica service needing a push gateway.
 */
export type Labels = Readonly<Record<string, string>>;

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${value}"`)
    .join(",");
}

export class Counter {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  entries(): readonly { readonly labels: string; readonly value: number }[] {
    return [...this.values.entries()].map(([labels, value]) => ({ labels, value }));
  }
}

export interface HistogramSnapshot {
  readonly labels: string;
  readonly count: number;
  readonly sum: number;
}

export class Histogram {
  private readonly counts = new Map<string, number>();
  private readonly sums = new Map<string, number>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  observe(valueMs: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.sums.set(key, (this.sums.get(key) ?? 0) + valueMs);
  }

  entries(): readonly HistogramSnapshot[] {
    return [...this.counts.entries()].map(([labels, count]) => ({
      labels,
      count,
      sum: this.sums.get(labels) ?? 0,
    }));
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  counter(name: string, help: string): Counter {
    let existing = this.counters.get(name);
    if (!existing) {
      existing = new Counter(name, help);
      this.counters.set(name, existing);
    }
    return existing;
  }

  histogram(name: string, help: string): Histogram {
    let existing = this.histograms.get(name);
    if (!existing) {
      existing = new Histogram(name, help);
      this.histograms.set(name, existing);
    }
    return existing;
  }

  /** Prometheus text exposition format (a well-known, tool-agnostic format — no client library
   * required to produce or scrape it). */
  toPrometheusText(): string {
    const lines: string[] = [];
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`, `# TYPE ${counter.name} counter`);
      for (const entry of counter.entries()) {
        lines.push(`${counter.name}{${entry.labels}} ${String(entry.value)}`);
      }
    }
    for (const histogram of this.histograms.values()) {
      lines.push(
        `# HELP ${histogram.name} ${histogram.help}`,
        `# TYPE ${histogram.name} histogram`,
      );
      for (const entry of histogram.entries()) {
        lines.push(`${histogram.name}_count{${entry.labels}} ${String(entry.count)}`);
        lines.push(`${histogram.name}_sum{${entry.labels}} ${String(entry.sum)}`);
      }
    }
    return lines.join("\n") + "\n";
  }
}
