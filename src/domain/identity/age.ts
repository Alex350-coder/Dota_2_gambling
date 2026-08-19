/** RULE-K (Claude/Rules.md) / MET-RG-01: an account may not reach ACTIVE unless the
 * holder is 18 or older as of the reference instant. */
export function isAdult(dateOfBirth: string, asOf: Date): boolean {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return false;
  }

  const cutoff = new Date(Date.UTC(dob.getUTCFullYear() + 18, dob.getUTCMonth(), dob.getUTCDate()));
  return cutoff.getTime() <= asOf.getTime();
}
