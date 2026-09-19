import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { serializeLedgerEntry } from "../serialize";
import { listTransactionsQuerySchema } from "../schemas";

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "wallet:read");

      const query = parseQuery(request, listTransactionsQuerySchema);
      const currency = query.currency ?? container.config.CURRENCY;

      const result = await container.listTransactions.execute({
        userId,
        currency,
        page: query.page,
        limit: query.limit,
      });

      return NextResponse.json(
        {
          transactions: result.items.map(serializeLedgerEntry),
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
