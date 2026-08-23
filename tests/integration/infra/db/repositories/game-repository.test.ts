import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleGameRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a game and finds it by id and slug", async () => {
    const slug = `dota2-${randomUUID()}`;

    const created = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).create({ id: randomUUID(), slug, name: "Dota 2" }),
    );

    const byId = await uow.run((tx: DbTx) => new DrizzleGameRepository(tx).findById(created.id));
    const bySlug = await uow.run((tx: DbTx) => new DrizzleGameRepository(tx).findBySlug(slug));

    expect(byId?.id).toBe(created.id);
    expect(bySlug?.id).toBe(created.id);
  });

  it("returns null for an unknown game id or slug", async () => {
    const byId = await uow.run((tx: DbTx) => new DrizzleGameRepository(tx).findById(randomUUID()));
    const bySlug = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).findBySlug(`missing-${randomUUID()}`),
    );

    expect(byId).toBeNull();
    expect(bySlug).toBeNull();
  });

  it("lists all games including newly created ones", async () => {
    const slug = `cs2-${randomUUID()}`;
    const created = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).create({ id: randomUUID(), slug, name: "CS2" }),
    );

    const all = await uow.run((tx: DbTx) => new DrizzleGameRepository(tx).list());

    expect(all.some((g) => g.id === created.id)).toBe(true);
  });

  it("creates a game mode scoped to its game and lists it back", async () => {
    const game = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).create({
        id: randomUUID(),
        slug: `g-${randomUUID()}`,
        name: "G",
      }),
    );

    const mode = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).createMode({
        id: randomUUID(),
        gameId: game.id,
        name: "Standard",
      }),
    );

    const modes = await uow.run((tx: DbTx) => new DrizzleGameRepository(tx).listModes(game.id));

    expect(modes).toHaveLength(1);
    expect(modes[0]?.id).toBe(mode.id);
  });
});
