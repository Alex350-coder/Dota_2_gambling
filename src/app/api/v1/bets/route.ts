import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { requireIdempotencyKey, withHttpIdempotency } from "@/platform/http/idempotent-route";
import { placeBetSchema } from "./schemas";

const ROUTE = "POST /bets";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "financial",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "bet:place");

      const body = await parseJsonBody(request, placeBetSchema);
      const idempotencyKey = requireIdempotencyKey(request);

      const { status, body: responseBody } = await withHttpIdempotency(
        container,
        { request, userId, route: ROUTE, requestBody: body },
        async () => {
          const order = await container.placeOrder.execute({
            userId,
            marketId: body.marketId,
            outcomeId: body.outcomeId,
            requestedMinor: BigInt(body.amountMinor),
            idempotencyKey,
          });

          return {
            status: 201,
            body: {
              order: {
                id: order.id,
                marketId: order.marketId,
                outcomeId: order.outcomeId,
                requestedMinor: order.requestedMinor.toString(),
                matchedMinor: order.matchedMinor.toString(),
                unmatchedMinor: order.unmatchedMinor.toString(),
                status: order.status,
                createdAt: order.createdAt,
              },
            },
          };
        },
      );

      return NextResponse.json(responseBody, { status });
    },
  });
}
