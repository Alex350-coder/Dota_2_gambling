export interface MailMessage {
  readonly to: string;
  readonly template: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Generic over Tx like LedgerWriter<Tx> — sending an email is written to the outbox
 * inside the caller's transaction so it never "sends" a message for a registration
 * that ultimately rolls back.
 */
export interface MailProvider<Tx = unknown> {
  send(tx: Tx, message: MailMessage): Promise<void>;
}
