#!/usr/bin/env node
// @ts-nocheck

const args = new Set(process.argv.slice(2));
const target = [...args].find((arg) => arg.startsWith("--target="))?.slice(9) ?? "http://localhost:3000";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(target) && !args.has("--allow-remote")) throw new Error("Remote targets require --allow-remote.");
const base = target.replace(/\/$/, "");
const requests = [];
for (let index = 0; index < 40; index += 1) requests.push("/api/rankings?eventId=333&paged=1&start=0");
for (let index = 0; index < 12; index += 1) requests.push(`/api/rankings?eventId=333&paged=1&start=${index * 250}`);
for (const value of ["f", "fe", "fel", "feliks"]) requests.push(`/api/rankings?eventId=333&search=${encodeURIComponent(value)}`);
for (let index = 0; index < 12; index += 1) requests.push(`/api/rankings?eventId=${index % 2 ? "222" : "333"}&paged=1&start=${(index + 1) * 50}`);
const outcomes = new Map(), statuses = new Map(), durations = [], serverTimings = [];
for (const path of requests) {
  const started = performance.now(); const response = await fetch(`${base}${path}`); durations.push(performance.now() - started);
  statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
  const outcome = response.headers.get("x-rankings-cache") ?? "none"; outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  const timing = response.headers.get("server-timing"); if (timing) serverTimings.push(timing); await response.arrayBuffer();
}
durations.sort((a, b) => a - b);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)].toFixed(1);
console.log(JSON.stringify({ target: base, requests: requests.length, statuses: Object.fromEntries(statuses), latency_ms: { p50: Number(percentile(.5)), p95: Number(percentile(.95)) }, cache_outcomes: Object.fromEntries(outcomes), server_timing_samples: serverTimings.slice(0, 5) }, null, 2));
