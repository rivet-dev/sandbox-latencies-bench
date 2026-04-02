import { readFileSync, writeFileSync } from "fs";

function parseCSV(path) {
  const raw = readFileSync(path, "utf-8").trim();
  const [header, ...rows] = raw.split("\n");
  const cols = header.split(",");
  const data = {};
  for (const col of cols.slice(2)) data[col] = []; // skip iteration,sample
  for (const row of rows) {
    const vals = row.split(",");
    for (let i = 2; i < cols.length; i++) {
      const v = parseFloat(vals[i]);
      if (!isNaN(v)) data[cols[i]].push(v);
    }
  }
  return data;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)];
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: Math.round(percentile(arr, 0.5) * 100) / 100,
    p95: Math.round(percentile(arr, 0.95) * 100) / 100,
    mean: Math.round((arr.reduce((a, b) => a + b) / arr.length) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
  };
}

const sandbox = parseCSV("sandbox-raw.csv");
const provider = parseCSV("provider-raw.csv");

function buildChart(statName, fn) {
  const s = (key) => {
    const d = sandbox[key] || provider[key];
    return d && d.length > 0 ? fn(d) : "";
  };

  return [
    ["metric", "E2B", "Daytona", "Direct", "OpenRouter"],
    ["Coldstart",          s("e2b:coldstart"),    s("daytona:coldstart"),        "", ""],
    ["Tool Execution",     s("e2b:native-exec"),  s("daytona:native-exec"),      "", ""],
    ["Network Round Trip", s("e2b:agent-health"), s("daytona:agent-health"),     "", ""],
    ["Haiku 4.5",          "", "", s("llm:anthropic-haiku"),  s("llm:openrouter-haiku")],
    ["Opus 4.6",           "", "", s("llm:anthropic-opus"),   s("llm:openrouter-opus")],
    ["GPT-5 mini",         "", "", s("llm:openai-mini"),      s("llm:openrouter-openai-mini")],
    ["GPT-5",              "", "", s("llm:openai"),           s("llm:openrouter-openai")],
  ];
}

const toCSV = (rows) => rows.map((r) => r.join(",")).join("\n") + "\n";

for (const [name, fn] of [
  ["p50", (d) => stats(d).p50],
  ["p95", (d) => stats(d).p95],
  ["mean", (d) => stats(d).mean],
]) {
  const chart = buildChart(name, fn);
  const path = `chart-${name}.csv`;
  writeFileSync(path, toCSV(chart));
  console.log(`=== ${path} ===`);
  console.log(toCSV(chart));
}

// Also dump a full stats table
console.log("=== Full stats ===");
const allKeys = [...Object.keys(sandbox), ...Object.keys(provider)];
console.log("test,n,p50,p95,mean,min,max");
for (const key of allKeys) {
  const d = sandbox[key] || provider[key];
  const s = stats(d);
  console.log(`${key},${d.length},${s.p50},${s.p95},${s.mean},${s.min},${s.max}`);
}
