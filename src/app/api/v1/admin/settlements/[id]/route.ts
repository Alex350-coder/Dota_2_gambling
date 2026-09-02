import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorize } from "@/platform/authz";
import { idParamSchema } from "../../../schemas";
import { serializeSettlementRun } from "../serialize";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

/** Read-only detail lookup — no requireStepUp() (nothing here moves money, unlike settle/void). */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const { id } = await params;
      const parsedId = idParamSchema.safeParse({ id });
      if (!parsedId.success) {
        throw new DomainError("VALIDATION_FAILED", "settlement run id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      await authorize(container, {
        token,
        action: "settlement:manage",
        resource: { ownerId: "settlement" },
      });

      const run = await container.getSettlementRun.execute({ id: parsedId.data.id });
      return NextResponse.json({ run: serializeSettlementRun(run) }, { status: 200 });
    },
  });
}
