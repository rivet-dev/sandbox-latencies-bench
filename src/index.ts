import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { ALL_TESTS, runTests, teardownAll, toCSV } from "./runner.js";
import { getE2bContext, setupE2b } from "./sandboxes/e2b.js";
import { getDaytonaContext, setupDaytona } from "./sandboxes/daytona.js";

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

    const format = c.req.query("format");
    if (format === "csv") {
      return c.text(toCSV(result), 200, {
        "Content-Type": "text/csv",
      });
    }
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

app.get("/netinfo", async (c) => {
  try {
    // Lambda's own IP
    const lambdaStart = performance.now();
    const lambdaResp = await fetch("https://ipinfo.io/json");
    const lambdaRtt = performance.now() - lambdaStart;
    const lambdaInfo = await lambdaResp.json() as Record<string, unknown>;

    const results: Record<string, unknown> = {
      lambda: { ...lambdaInfo, rtt_to_ipinfo_ms: Math.round(lambdaRtt * 100) / 100 },
    };

    // E2B
    try {
      await setupE2b();
      const e2bCtx = getE2bContext()!;
      const e2bIp = await e2bCtx.sandbox.commands.run("curl -s https://ipinfo.io/json", { timeoutMs: 15_000 });

      const e2bPingStart = performance.now();
      await e2bCtx.sandbox.commands.run("echo ok");
      const e2bRtt = performance.now() - e2bPingStart;

      results.e2b = {
        ...JSON.parse(e2bIp.stdout),
        rtt_from_lambda_ms: Math.round(e2bRtt * 100) / 100,
      };
    } catch (err) {
      results.e2b = { error: err instanceof Error ? err.message : String(err) };
    }

    // Daytona
    try {
      await setupDaytona();
      const dayCtx = getDaytonaContext()!;
      const dayIp = await dayCtx.sandbox.process.executeCommand("curl -s https://ipinfo.io/json");

      const dayPingStart = performance.now();
      await dayCtx.sandbox.process.executeCommand("echo ok");
      const dayRtt = performance.now() - dayPingStart;

      results.daytona = {
        ...JSON.parse(dayIp.result),
        rtt_from_lambda_ms: Math.round(dayRtt * 100) / 100,
      };
    } catch (err) {
      results.daytona = { error: err instanceof Error ? err.message : String(err) };
    }

    return c.json(results);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get("/exec", async (c) => {
  const provider = c.req.query("provider") ?? "e2b";
  const cmd = c.req.query("cmd") ?? "echo ok";
  try {
    if (provider === "e2b") {
      await setupE2b();
      const ctx = getE2bContext()!;
      const result = await ctx.sandbox.commands.run(cmd, { timeoutMs: 30_000 });
      return c.json({ provider, cmd, stdout: result.stdout, stderr: result.stderr });
    } else {
      await setupDaytona();
      const ctx = getDaytonaContext()!;
      const result = await ctx.sandbox.process.executeCommand(cmd);
      return c.json({ provider, cmd, output: result.result });
    }
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post("/teardown", async (c) => {
  await teardownAll();
  return c.json({ status: "destroyed" });
});

export const handler = handle(app);
export default app;
