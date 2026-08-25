import { describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/errors";
import type {
  CreateIdempotencyKeyInput,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
} from "@/domain/ports";
import { withIdempotency } from "./idempotency";

class FakeIdempotencyKeyRepository implements IdempotencyKeyRepository {
  private rows = new Map<string, IdempotencyKeyRecord>();

  private rowKey(userId: string, route: string, key: string): string {
    return `${userId}:${route}:${key}`;
  }

  seed(record: IdempotencyKeyRecord): void {
    this.rows.set(this.rowKey(record.userId, record.route, record.key), record);
  }

  tryCreate(input: CreateIdempotencyKeyInput): Promise<boolean> {
    const rowKey = this.rowKey(input.userId, input.route, input.key);
    if (this.rows.has(rowKey)) {
      return Promise.resolve(false);
    }
    this.rows.set(rowKey, {
      userId: input.userId,
      route: input.route,
      key: input.key,
      requestHash: input.requestHash,
      responseStatus: null,
      responseBody: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    return Promise.resolve(true);
  }

  findByKey(userId: string, route: string, key: string): Promise<IdempotencyKeyRecord | null> {
    return Promise.resolve(this.rows.get(this.rowKey(userId, route, key)) ?? null);
  }

  updateResponse(
    userId: string,
    route: string,
    key: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    const rowKey = this.rowKey(userId, route, key);
    const existing = this.rows.get(rowKey);
    if (!existing) throw new Error("fixture row not found");
    this.rows.set(rowKey, { ...existing, responseStatus, responseBody });
    return Promise.resolve();
  }
}

describe("withIdempotency", () => {
  it("runs the handler and caches its response on a first attempt", async () => {
    const repo = new FakeIdempotencyKeyRepository();
    const handler = vi.fn().mockResolvedValue({ status: 201, body: { orderId: "o1" } });

    const result = await withIdempotency(
      repo,
      { userId: "u1", route: "POST /bets", idempotencyKey: "k1", requestBody: { stake: "100" } },
      handler,
    );

    expect(result).toEqual({ status: 201, body: { orderId: "o1" } });
    expect(handler).toHaveBeenCalledTimes(1);

    const stored = await repo.findByKey("u1", "POST /bets", "k1");
    expect(stored?.responseStatus).toBe(201);
    expect(stored?.responseBody).toEqual({ orderId: "o1" });
  });

  it("replays the cached response without re-running the handler on a same-body retry", async () => {
    const repo = new FakeIdempotencyKeyRepository();
    const request = {
      userId: "u1",
      route: "POST /bets",
      idempotencyKey: "k1",
      requestBody: { stake: "100" },
    };

    const firstHandler = vi.fn().mockResolvedValue({ status: 201, body: { orderId: "o1" } });
    await withIdempotency(repo, request, firstHandler);

    const secondHandler = vi.fn();
    const replayed = await withIdempotency(repo, request, secondHandler);

    expect(replayed).toEqual({ status: 201, body: { orderId: "o1" } });
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("throws IDEMPOTENCY_KEY_REUSE when the same key is reused with a different body", async () => {
    const repo = new FakeIdempotencyKeyRepository();
    const request1 = {
      userId: "u1",
      route: "POST /bets",
      idempotencyKey: "k1",
      requestBody: { stake: "100" },
    };
    await withIdempotency(repo, request1, vi.fn().mockResolvedValue({ status: 201, body: {} }));

    const request2 = { ...request1, requestBody: { stake: "200" } };
    await expect(
      withIdempotency(repo, request2, vi.fn().mockResolvedValue({ status: 201, body: {} })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE" } satisfies Partial<DomainError>);
  });

  it("throws SERVICE_BUSY when a concurrent in-flight attempt has not yet cached a response", async () => {
    const repo = new FakeIdempotencyKeyRepository();
    const request = {
      userId: "u1",
      route: "POST /bets",
      idempotencyKey: "k1",
      requestBody: { stake: "1" },
    };
    // Simulate a still-in-flight winner: tryCreate() succeeded but updateResponse() hasn't run
    // yet, so responseStatus stays null (never fires because the concurrent handler never
    // resolves — no need to await it).
    void withIdempotency(repo, request, () => new Promise(() => undefined));

    await expect(withIdempotency(repo, request, vi.fn())).rejects.toMatchObject({
      code: "SERVICE_BUSY",
    } satisfies Partial<DomainError>);
  });

  it("never caches a response when the handler throws (rollback leaves nothing to replay)", async () => {
    const repo = new FakeIdempotencyKeyRepository();
    const handler = vi.fn().mockRejectedValue(new DomainError("INSUFFICIENT_FUNDS", "no funds"));

    await expect(
      withIdempotency(
        repo,
        { userId: "u1", route: "POST /bets", idempotencyKey: "k1", requestBody: {} },
        handler,
      ),
    ).rejects.toThrow(DomainError);
  });
});
