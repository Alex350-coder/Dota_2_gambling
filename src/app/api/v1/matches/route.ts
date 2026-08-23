import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseQuery } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { pageQuerySchema } from "../schemas";

// PUBLIC_ROUTE

export async function GET(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "public",
    handler: async () => {
      const query = parseQuery(request, pageQuerySchema);
      const container = getContainer();
      const result = await container.listMatches.execute(query);

      return NextResponse.json(
        {
          matches: result.items,
          meta: { total: result.total, page: result.page, limit: result.limit },
        },
        { status: 200 },
      );
    },
  });
}
