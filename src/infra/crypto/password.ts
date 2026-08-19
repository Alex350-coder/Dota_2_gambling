import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "@/domain/ports";

export interface Argon2Params {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

// PHC string params segment looks like "m=65536,t=3,p=1" — parsed here because
// @node-rs/argon2 does not expose a needsRehash helper (unlike some other bindings).
const PARAMS_SEGMENT_PATTERN = /\$m=(\d+),t=(\d+),p=(\d+)\$/;

export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly params: Argon2Params) {}

  async hash(plain: string): Promise<string> {
    return hash(plain, {
      memoryCost: this.params.memoryCost,
      timeCost: this.params.timeCost,
      parallelism: this.params.parallelism,
    });
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    return verify(hashed, plain);
  }

  needsRehash(hashed: string): boolean {
    const match = PARAMS_SEGMENT_PATTERN.exec(hashed);
    if (!match) {
      return true;
    }

    const [, memoryCost, timeCost, parallelism] = match;
    return (
      Number(memoryCost) < this.params.memoryCost ||
      Number(timeCost) < this.params.timeCost ||
      Number(parallelism) < this.params.parallelism
    );
  }
}
