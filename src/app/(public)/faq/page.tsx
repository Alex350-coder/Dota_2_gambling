export const metadata = {
  title: "FAQ — P2P Arena",
};

const FAQ_ITEMS: readonly { question: string; answer: string }[] = [
  {
    question: "Is this real money?",
    answer:
      "No. This is a portfolio engineering project. All amounts are simulated; no real currency is ever deposited, wagered, or paid out.",
  },
  {
    question: "How are odds set?",
    answer: "Odds are fixed at 1.8x for every market — see How It Works for the full example.",
  },
  {
    question: "Who takes a cut?",
    answer:
      "The platform takes no commission. Streamers hosting a market receive 20% of the matched pool, deducted before payout.",
  },
  {
    question: "What happens to the part of my bet that isn't matched?",
    answer:
      "It stays reserved until it's matched, the market closes, or you cancel it — either way it's released back to your available balance untouched.",
  },
  {
    question: "Can I withdraw real money?",
    answer:
      "No. There is no real-money withdrawal path anywhere in this product; see the Legal section for the full policy set.",
  },
];

export default function FaqPage() {
  return (
    <article className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">Frequently asked questions</h1>
      <dl className="flex flex-col gap-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <dt className="font-semibold">{item.question}</dt>
            <dd className="mt-1 text-[var(--text-secondary)]">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
