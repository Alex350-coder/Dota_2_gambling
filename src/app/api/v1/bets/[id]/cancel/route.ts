import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { idParamSchema } from "../../../schemas";
import { serializeBetOrder } from "../../serialize";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "financial",
    handler: async () => {
      const { id } = await params;
      const parsed = idParamSchema.safeParse({ id });
      if (!parsed.success) {
        throw new DomainError("VALIDATION_FAILED", "bet order id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "bet:manage");

      const order = await container.cancelOrder.execute({
        actorId: userId,
        orderId: parsed.data.id,
      });

      return NextResponse.json({ order: serializeBetOrder(order) }, { status: 200 });
    },
  });
}
