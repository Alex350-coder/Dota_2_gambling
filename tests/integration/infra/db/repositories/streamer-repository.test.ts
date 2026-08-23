import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleStreamerRepository } from "@/infra/db/repositories/streamer-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleStreamerRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `streamer-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("creates a streamer and finds it by id", async () => {
    const userId = await createUser();

    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).create({
        id: randomUUID(),
        userId,
        displayName: "StreamerOne",
        defaultCommissionBps: 2000,
      }),
    );

    expect(created.defaultCommissionBps).toBe(2000);

    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).findById(created.id),
    );
    expect(found?.id).toBe(created.id);
  });

  it("updates the default commission bps", async () => {
    const userId = await createUser();
    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).create({
        id: randomUUID(),
        userId,
        displayName: "StreamerTwo",
        defaultCommissionBps: 2000,
      }),
    );

    const updated = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).updateDefaultCommissionBps(created.id, 2500),
    );

    expect(updated.defaultCommissionBps).toBe(2500);
  });

  it("creates and lists channels for a streamer", async () => {
    const userId = await createUser();
    const streamer = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).create({
        id: randomUUID(),
        userId,
        displayName: "StreamerThree",
        defaultCommissionBps: 2000,
      }),
    );

    await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).createChannel({
        id: randomUUID(),
        streamerId: streamer.id,
        platform: "twitch",
        channelUrl: "https://twitch.tv/streamerthree",
      }),
    );

    const channels = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).listChannels(streamer.id),
    );
    expect(channels).toHaveLength(1);
    expect(channels[0]?.platform).toBe("twitch");
  });
});
