import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { toErrorResponse } from "./errors";

async function bodyOf(response: Response): Promise<unknown> {
  return response.json();
}

describe("toErrorResponse", () => {
  it("maps a DomainError to its ERROR_CODE_META http status", async () => {
    const error = new DomainError("RESOURCE_NOT_FOUND", "session not found for this user");
    const response = toErrorResponse(error, "req-1");

    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "session not found for this user",
        requestId: "req-1",
      },
    });
  });

  it("includes details when the DomainError carries them", async () => {
    const error = new DomainError(
      "VALIDATION_FAILED",
      "password must be between 12 and 128 characters",
      {
        details: { field: "password" },
      },
    );
    const response = toErrorResponse(error, "req-2");

    expect(await bodyOf(response)).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "password must be between 12 and 128 characters",
        details: { field: "password" },
        requestId: "req-2",
      },
    });
  });

  it("maps a non-DomainError to a generic INTERNAL_ERROR without leaking its message", async () => {
    const raw = new Error("password=hunter2 select * from users where email='a@b.com'");
    const response = toErrorResponse(raw, "req-3");
    const body = JSON.stringify(await bodyOf(response));

    expect(response.status).toBe(500);
    expect(body).not.toContain("password");
    expect(body).not.toContain("select");
    expect(body).not.toContain("a@b.com");
  });

  it("never includes a stack trace or cause in the body", async () => {
    const error = new DomainError("INTERNAL_ERROR", "boom", { cause: new Error("db exploded") });
    const response = toErrorResponse(error, "req-4");
    const body = JSON.stringify(await bodyOf(response));

    expect(body).not.toContain("stack");
    expect(body).not.toContain("at Object.");
    expect(body).not.toContain("db exploded");
  });

  it("generates a requestId when none is provided", async () => {
    const response = toErrorResponse(new DomainError("UNAUTHENTICATED", "no session"));
    const body = (await bodyOf(response)) as { error: { requestId: string } };

    expect(typeof body.error.requestId).toBe("string");
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });
});
