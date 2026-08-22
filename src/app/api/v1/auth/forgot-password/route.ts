import { NextResponse } from "next/server";
import { getContainer } from "@/platform/http/container";
import { parseJsonBody } from "@/platform/http/body";
import { runRoute } from "@/platform/http/route";
import { forgotPasswordSchema } from "../schemas";

// PUBLIC_ROUTE

/** Always 202, whether or not the email exists (Routes.md §3: no enumeration). */
export async function POST(request: Request): Promise<Response> {
  return runRoute({
    request,
    rateLimitClass: "auth-strict",
    handler: async () => {
      const body = await parseJsonBody(request, forgotPasswordSchema);
      await getContainer().forgotPassword.execute(body);
      return NextResponse.json({}, { status: 202 });
    },
  });
}
