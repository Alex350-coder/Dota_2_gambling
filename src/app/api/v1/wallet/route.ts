import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { sessionTokenFromRequest } from "@/platform/http/request-context";
import { authorizeSelf } from "@/platform/http/self-authorize";
import { serializeWallet } from "./serialize";
import { getWalletQuerySchema } from "./schemas";

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "default",
    handler: async () => {
      const container = getContainer();
      const token = sessionTokenFromRequest(request, container.config);
      const { userId } = await authorizeSelf(container, token, "wallet:read");

      const query = parseQuery(request, getWalletQuerySchema);
      const currency = query.currency ?? container.config.CURRENCY;

      const { wallet, lockedByMarket } = await container.getWallet.execute({
        userId,
        currency,
      });

      return NextResponse.json(
        {
          wallet: serializeWallet(wallet),
          lockedByMarket: lockedByMarket.map((entry) => ({
            marketId: entry.marketId,
            lockedMinor: entry.lockedMinor.toString(),
          })),
        },
        { status: 200 },
      );
    },
  });
}
