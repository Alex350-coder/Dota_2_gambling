import type { Minor } from "../money/types";

export interface PaymentReference {
  readonly reference: string;
}

export interface PaymentProvider {
  initiateDeposit(userId: string, amountMinor: Minor): Promise<PaymentReference>;
  initiateWithdrawal(userId: string, amountMinor: Minor): Promise<PaymentReference>;
}
