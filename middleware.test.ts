import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "@/middleware";

// Tests for the edge cookie check on /api/admin/* (#112).

function request(path: string, token?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: token ? { cookie: `session-token=${token}` } : {},
  });
}

// NextResponse.next() marks the response with this header.
const isPassThrough = (response: Response) =>
  response.headers.get("x-middleware-next") === "1";

describe("middleware", () => {
  it("rejects admin API calls without a session cookie", async () => {
    const response = await middleware(request("/api/admin/users/1"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required - no session token",
    });
  });

  it("lets admin API calls with a session cookie through", async () => {
    const response = await middleware(request("/api/admin/users/1", "abc"));
    expect(isPassThrough(response)).toBe(true);
  });

  it("lets other paths through without a cookie", async () => {
    const response = await middleware(request("/api/query"));
    expect(isPassThrough(response)).toBe(true);
  });

  it("only matches admin API routes", () => {
    expect(config.matcher).toEqual(["/api/admin/:path*"]);
  });
});
