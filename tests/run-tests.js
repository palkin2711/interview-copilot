import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/manifest.webmanifest",
  "public/sw.js",
  "api/answer.js",
  "api/sync.js",
  "vercel.json"
];

for (const file of required) assert.ok(fs.existsSync(file), `Missing ${file}`);

const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.icons.length, 2);

const html = fs.readFileSync("public/index.html", "utf8");
assert.match(html, /Start listening/);
assert.match(html, /Suggested answer/);
assert.match(html, /Laptop — display answers/);

const api = fs.readFileSync("api/answer.js", "utf8");
assert.match(api, /GEMINI_API_KEY/);
assert.match(api, /Never invent/);

const syncApi = fs.readFileSync("api/sync.js", "utf8");
assert.match(syncApi, /UPSTASH_REDIS_REST_URL/);

console.log("All project checks passed.");
