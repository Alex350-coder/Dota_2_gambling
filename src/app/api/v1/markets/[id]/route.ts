import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { idParamSchema } from "../../schemas";

// PUBLIC_ROUTE

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "public",
    handler: async () => {
      const { id } = await params;
      const parsed = idParamSchema.safeParse({ id });
      if (!parsed.success) {
        throw new DomainError("VALIDATION_FAILED", "market id must be a UUID");
      }

      const container = getContainer();
      const market = await container.getMarket.execute({ id: parsed.data.id });
      return NextResponse.json({ market }, { status: 200 });
    },
  });
}
