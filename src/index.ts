import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { ALL_TESTS, runTests, teardownAll } from "./runner.js";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    tests: ALL_TESTS,
    usage: "GET /run?tests=*&samples=3",
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/run", async (c) => {
  const tests = c.req.query("tests") ?? "*";
  const samples = parseInt(c.req.query("samples") ?? "3", 10);
  const e2bSandboxId = c.req.query("e2bSandboxId");
  const daytonaSandboxId = c.req.query("daytonaSandboxId");

  try {
    const result = await runTests(tests, samples, {
      e2bSandboxId: e2bSandboxId || undefined,
      daytonaSandboxId: daytonaSandboxId || undefined,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

app.post("/teardown", async (c) => {
  await teardownAll();
  return c.json({ status: "destroyed" });
});

export const handler = handle(app);
export default app;
