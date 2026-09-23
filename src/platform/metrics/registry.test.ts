import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "./registry";

describe("MetricsRegistry", () => {
  it("increments a counter per distinct label set", () => {
    const registry = new MetricsRegistry();
    const counter = registry.counter("http_requests_total", "total HTTP requests");
    counter.inc({ route: "/api/v1/bets", status: "200" });
    counter.inc({ route: "/api/v1/bets", status: "200" });
    counter.inc({ route: "/api/v1/bets", status: "500" });

    const entries = counter.entries();
    expect(entries.find((e) => e.labels.includes('status="200"'))?.value).toBe(2);
    expect(entries.find((e) => e.labels.includes('status="500"'))?.value).toBe(1);
  });

  it("accumulates a histogram's count and sum per label set", () => {
    const registry = new MetricsRegistry();
    const histogram = registry.histogram("http_request_duration_ms", "request duration");
    histogram.observe(10, { route: "/api/v1/bets" });
    histogram.observe(20, { route: "/api/v1/bets" });

    const [entry] = histogram.entries();
    expect(entry?.count).toBe(2);
    expect(entry?.sum).toBe(30);
  });

  it("returns the same counter/histogram instance on repeated lookups by name", () => {
    const registry = new MetricsRegistry();
    const first = registry.counter("x", "help");
    const second = registry.counter("x", "help");
    first.inc();
    expect(second.entries()[0]?.value).toBe(1);
  });

  it("renders Prometheus text exposition format with HELP/TYPE lines", () => {
    const registry = new MetricsRegistry();
    registry
      .counter("http_requests_total", "total HTTP requests")
      .inc({ route: "/x", status: "200" });
    registry.histogram("http_request_duration_ms", "request duration").observe(5, { route: "/x" });

    const text = registry.toPrometheusText();
    expect(text).toContain("# TYPE http_requests_total counter");
    expect(text).toContain('http_requests_total{route="/x",status="200"} 1');
    expect(text).toContain("# TYPE http_request_duration_ms histogram");
    expect(text).toContain('http_request_duration_ms_count{route="/x"} 1');
    expect(text).toContain('http_request_duration_ms_sum{route="/x"} 5');
  });
});
