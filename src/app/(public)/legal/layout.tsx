export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 text-[var(--text-primary)] [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-[var(--text-secondary)] [&_li]:text-[var(--text-secondary)] [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  );
}
