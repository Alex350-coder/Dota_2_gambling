import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { requireIdempotencyKey, withHttpIdempotency } from "@/platform/http/idempotent-route";
import { serializeWallet } from "../serialize";
import { simulatedCreditSchema } from "../schemas";

const ROUTE = "POST /wallet/simulated-credit";

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "financial",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "wallet:credit");

      const body = await parseJsonBody(request, simulatedCreditSchema);
      const idempotencyKey = requireIdempotencyKey(request);

      const { status, body: responseBody } = await withHttpIdempotency(
        container,
        { request, userId, route: ROUTE, requestBody: body },
        async () => {
          const result = await container.simulatedCredit.execute({
            userId,
            currency: body.currency,
            amountMinor: BigInt(body.amountMinor),
            idempotencyKey,
          });

          return {
            status: 201,
            body: {
              wallet: serializeWallet(result.wallet),
              ledgerTransactionId: result.ledgerTransactionId,
            },
          };
        },
      );

      return NextResponse.json(responseBody, { status });
    },
  });
}
