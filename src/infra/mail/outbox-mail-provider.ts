import type { MailMessage, MailProvider } from "@/domain/ports";
import { outbox } from "../db/schema/platform";
import type { DbTx } from "../db/uow";

/**
 * Writes into the existing outbox table (T-210) instead of calling a real mail
 * provider — no external mail dependency exists for this MVP; a dispatcher job can
 * later drain `outbox` rows with `topic = 'mail'`.
 */
export class OutboxMailProvider implements MailProvider<DbTx> {
  async send(tx: DbTx, message: MailMessage): Promise<void> {
    await tx.insert(outbox).values({
      topic: "mail",
      payload: { to: message.to, template: message.template, data: message.data },
    });
  }
}
