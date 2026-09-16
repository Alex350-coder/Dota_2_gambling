export const metadata = {
  title: "About — P2P Arena",
};

export default function AboutPage() {
  return (
    <article className="flex flex-col gap-4 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">About this project</h1>
      <p className="text-[var(--text-secondary)]">
        P2P Arena is a portfolio engineering project: a peer-to-peer, fixed-odds esports betting
        platform built end-to-end with simulated money only. It exists to demonstrate production-
        grade practices — double-entry ledger accounting, transactional order matching,
        responsible-gambling controls, and public API design — not to operate as a real gambling
        product.
      </p>
      <p className="text-[var(--text-secondary)]">
        No real currency is ever deposited, wagered, or paid out. See the Legal section for the full
        policy set and Responsible Gambling page for the limits enforced across the platform.
      </p>
    </article>
  );
}
