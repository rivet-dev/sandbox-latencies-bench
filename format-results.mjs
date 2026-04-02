import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync("results.csv", "utf-8").trim();
const [header, ...rows] = raw.split("\n");
const cols = header.split(",");

const data = {};
for (const col of cols.slice(1)) data[col] = [];
for (const row of rows) {
  const vals = row.split(",");
  for (let i = 1; i < cols.length; i++) {
    const v = parseFloat(vals[i]);
    if (!isNaN(v)) data[cols[i]].push(v);
  }
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function m(key) {
  if (!data[key] || data[key].length === 0) return "";
  return Math.round(median(data[key]) * 100) / 100;
}

const combined = [
  ["metric", "E2B", "Daytona", "Direct", "OpenRouter"],
  ["Coldstart",          m("e2b:coldstart"),    m("daytona:coldstart"),  "", ""],
  ["Tool Execution",     m("e2b:native-exec"),  m("daytona:native-exec"), "", ""],
  ["Network Round Trip", m("e2b:agent-health"), m("daytona:agent-health"), "", ""],
  ["Haiku 4.5",          "", "", m("llm:anthropic-haiku"),  m("llm:openrouter-haiku")],
  ["Opus 4.6",           "", "", m("llm:anthropic-opus"),   m("llm:openrouter-opus")],
  ["GPT-5 mini",         "", "", m("llm:openai-mini"),      m("llm:openrouter-openai-mini")],
  ["GPT-5",              "", "", m("llm:openai"),           m("llm:openrouter-openai")],
];

const csv = combined.map((r) => r.join(",")).join("\n") + "\n";
writeFileSync("chart.csv", csv);
console.log(csv);
