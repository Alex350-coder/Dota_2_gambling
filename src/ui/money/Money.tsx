/** Currencies this component knows how to split into major/minor units. All are 2-decimal today (Validation.md). */
const MINOR_UNITS_PER_MAJOR = 100n;

export interface MoneyProps {
  /** Decimal-string wire format (Routes.md §2), e.g. `"10000"` — never a `number`. */
  readonly amountMinor: string;
  /** ISO 4217 currency code, always a sibling field, never embedded in `amountMinor` (Validation.md). */
  readonly currency: string;
  /** Renders a leading `+`/`-` sign explicitly instead of relying on color alone (a11y). */
  readonly signed?: boolean;
  readonly className?: string;
}

function parseAmountMinor(amountMinor: string): bigint {
  if (!/^-?\d+$/.test(amountMinor)) {
    throw new RangeError(`amountMinor must be an integer string, received "${amountMinor}"`);
  }
  return BigInt(amountMinor);
}

/**
 * Splits a bigint minor-unit quantity into its major/fractional parts using only integer
 * (bigint) division/modulo — never `Number()` division — so arbitrarily large sums never lose
 * precision. This is the one place in `src/ui/**` allowed to do this: every other component
 * must render money exclusively through `<Money>` (enforced by `scripts/check-money-formatting.ts`).
 */
function splitMajorMinor(quantity: bigint): { major: bigint; fraction: bigint } {
  const magnitude = quantity < 0n ? -quantity : quantity;
  const major = magnitude / MINOR_UNITS_PER_MAJOR;
  const fraction = magnitude % MINOR_UNITS_PER_MAJOR;
  return { major, fraction };
}

/**
 * The single money-formatting component (T-703, UI.md). No other file may format a money
 * value for display — always render through this component so every amount on screen is
 * server-confirmed data passed straight through, never re-derived client-side.
 */
export function Money({ amountMinor, currency, signed = false, className }: MoneyProps) {
  const quantity = parseAmountMinor(amountMinor);
  const { major, fraction } = splitMajorMinor(quantity);
  const fractionText = fraction.toString().padStart(2, "0");
  const majorText = new Intl.NumberFormat("en-US").format(major);
  const sign = quantity < 0n ? "-" : signed && quantity > 0n ? "+" : "";

  return (
    <span className={className} data-testid="money">
      {sign}
      {currency} {majorText}.{fractionText}
    </span>
  );
}

/** True when `value` looks like a valid `Minor`-shaped decimal string (guards user-typed input, UX only). */
export function isValidAmountMinorInput(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}
