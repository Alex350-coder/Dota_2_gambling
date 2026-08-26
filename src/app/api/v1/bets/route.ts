import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody, parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { requireIdempotencyKey, withHttpIdempotency } from "@/platform/http/idempotent-route";
import { serializeBetOrder } from "./serialize";
import { listBetsQuerySchema, placeBetSchema } from "./schemas";

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
            body: { order: serializeBetOrder(order) },
          };
        },
      );

      return NextResponse.json(responseBody, { status });
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "bet:manage");

      const query = parseQuery(request, listBetsQuerySchema);
      const result = await container.listBets.execute({ actorId: userId, ...query });

      return NextResponse.json(
        {
          orders: result.items.map(serializeBetOrder),
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
