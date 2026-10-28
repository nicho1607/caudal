// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const sessionUser = {
  id: "5e3d0c1a-7b2f-4c8e-9a6d-2f1b0e9c4d7a",
  email: "demo@caudal.app",
  name: "Demo",
  baseCurrency: "EUR",
  locale: "es-ES",
  timezone: "Europe/Madrid",
  weekStartsOn: 1,
};

const getSessionUser = vi.fn(async () => sessionUser);
vi.mock("@/server/auth", () => ({ getSessionUser: () => getSessionUser() }));

const { handler, NotFoundError, UnauthorizedError } = await import("@/server/http");

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe("handler", () => {
  beforeEach(() => {
    getSessionUser.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes the session user and parsed input, returns JSON 200", async () => {
    const GET = handler(
      {
        query: z.object({ limit: z.coerce.number().int(), tag: z.array(z.string()).optional() }),
        params: z.object({ id: z.string() }),
      },
      ({ user, query, params }) => ({ userId: user.id, query, params }),
    );
    const res = await GET(new Request("http://x/api/v1/t/abc?limit=10&tag=a&tag=b"), ctx({ id: "abc" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: sessionUser.id,
      query: { limit: 10, tag: ["a", "b"] },
      params: { id: "abc" },
    });
  });

  it("parses the JSON body and honours a custom status", async () => {
    const POST = handler({ body: z.object({ amount: z.number() }), status: 201 }, ({ body }) => body);
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ amount: 5 }) }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ amount: 5 });
  });

  it("maps ZodError to 400 with issues", async () => {
    const POST = handler({ body: z.object({ amount: z.number() }) }, () => "never");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ amount: "x" }) }),
      ctx(),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toEqual(expect.any(String));
    expect(json.issues[0].path).toEqual(["amount"]);
  });

  it("maps invalid JSON to 400", async () => {
    const POST = handler({ body: z.object({}) }, () => "never");
    const res = await POST(new Request("http://x", { method: "POST", body: "{nope" }), ctx());
    expect(res.status).toBe(400);
  });

  it("maps NotFoundError to 404", async () => {
    const GET = handler({}, () => {
      throw new NotFoundError("Transacción no encontrada");
    });
    const res = await GET(new Request("http://x"), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Transacción no encontrada" });
  });

  it("maps an auth failure to 401", async () => {
    getSessionUser.mockRejectedValueOnce(new UnauthorizedError());
    const fn = vi.fn();
    const res = await handler({}, fn)(new Request("http://x"), ctx());
    expect(res.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps unknown errors to 500 without leaking the message", async () => {
    const GET = handler({}, async () => {
      throw new Error("connection refused at 10.0.0.1");
    });
    const res = await GET(new Request("http://x"), ctx());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: expect.any(String) });
    expect(json.error).not.toContain("10.0.0.1");
  });

  it("returns a Response from fn as-is and 204 for undefined", async () => {
    const raw = await handler({}, () => new Response("ok", { status: 202 }))(new Request("http://x"));
    expect(raw.status).toBe(202);
    const empty = await handler({}, () => undefined)(new Request("http://x"));
    expect(empty.status).toBe(204);
  });
});
