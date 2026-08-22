import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { resetPasswordSchema } from "../schemas";

// PUBLIC_ROUTE

export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, resetPasswordSchema);
      await getContainer().resetPassword.execute(body);
      return NextResponse.json({}, { status: 200 });
    },
  });
}
