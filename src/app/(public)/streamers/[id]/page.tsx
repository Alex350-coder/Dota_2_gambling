import { notFound } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";

const idSchema = z.uuid();

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function StreamerDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    notFound();
  }
  const id = parsedId.data;

  const container = getContainer();

  let streamer;
  try {
    streamer = await container.getStreamer.execute({ id });
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESOURCE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6 text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold">{streamer.displayName}</h1>

      <div
        role="note"
        aria-label="Streamer commission disclosure"
        className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-secondary)]"
      >
        {streamer.displayName} earns a {(streamer.defaultCommissionBps / 100).toFixed(1)}%
        commission on matched stakes across their markets. This is a conflict of interest: the
        streamer benefits from higher betting volume regardless of outcome.
      </div>

      <p className="text-[var(--text-secondary)]">
        Browse this streamer&apos;s markets from the Matches and Markets pages.
      </p>
    </div>
  );
}
