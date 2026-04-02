import { readFileSync, writeFileSync } from "fs";

const sandboxCSV = readFileSync("sandbox-raw.csv", "utf-8");
const providerCSV = readFileSync("provider-raw.csv", "utf-8");

let html = readFileSync("chart.html", "utf-8");
html = html.replace("SANDBOX_DATA", "`" + sandboxCSV + "`");
html = html.replace("PROVIDER_DATA", "`" + providerCSV + "`");

writeFileSync("chart.html", html);
console.log("chart.html updated with data");
