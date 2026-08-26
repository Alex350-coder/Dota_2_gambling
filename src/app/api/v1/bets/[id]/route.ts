import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getContainer } from "@/platform/http/container";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { idParamSchema } from "../../schemas";
import { serializeBetOrder } from "../serialize";

interface RouteParams {
  readonly params: Promise<{ id: string }>;
}

/** Allocation rows never expose the counterparty's user id, only the two order ids. */
function serializeAllocation(allocation: {
  id: string;
  marketId: string;
  orderAId: string;
  orderBId: string;
  sequence: bigint;
  matchedMinor: bigint;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: allocation.id,
    marketId: allocation.marketId,
    orderAId: allocation.orderAId,
    orderBId: allocation.orderBId,
    sequence: allocation.sequence.toString(),
    matchedMinor: allocation.matchedMinor.toString(),
    status: allocation.status,
    createdAt: allocation.createdAt,
    updatedAt: allocation.updatedAt,
  };
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const { id } = await params;
      const parsed = idParamSchema.safeParse({ id });
      if (!parsed.success) {
        throw new DomainError("VALIDATION_FAILED", "bet order id must be a UUID");
      }

      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "bet:manage");

      const result = await container.getBet.execute({ actorId: userId, orderId: parsed.data.id });

      return NextResponse.json(
        {
          order: serializeBetOrder(result.order),
          allocations: result.allocations.map(serializeAllocation),
        },
        { status: 200 },
      );
    },
  });
}
