import { randomUUID } from "node:crypto";
import type { IdGenerator } from "@/domain/ports";

export class CryptoIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
