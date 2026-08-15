// Barrel for the Drizzle schema. Table modules are added incrementally as
// each persistence task (T-202..T-210) lands; keep this file free of table
// definitions of its own.
export * from "./identity";
export * from "./wallet";
