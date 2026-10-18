import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateSnapshot } from "./profile-data.mjs";
const root = new URL("../", import.meta.url);
const snapshot = validateSnapshot(JSON.parse(await readFile(new URL("data/profile.json", root), "utf8")));
const module = (await import(new URL("data/profile.js", root))).default;
assert.deepEqual(module, snapshot, "Local JSON fallback and browser snapshot must match");
for (const path of [snapshot.profile.avatarAsset, ...snapshot.achievements.map((badge) => badge.asset)]) {
  assert.match(path, /^assets\/[\w.-]+\.(png|jpg|webp)$/);
  await access(new URL(path, root));
}
for (const path of ["app.js", "lib/profile-view.js", "tools/profile-data.mjs", "tools/update-profile.mjs", "tools/build.mjs", "tools/profile.test.mjs"]) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(path, root))]);
}
for (const path of ["app.js", "lib/profile-view.js", "style.css", "index.html"]) {
  const source = await readFile(new URL(path, root), "utf8");
  assert.doesNotMatch(source, /requestAnimationFrame|setInterval|<canvas|<iframe|https:\/\/api\.github\.com|https:\/\/cdn\./i, `Unexpected runtime dependency in ${path}`);
}
const html = await readFile(new URL("index.html", root), "utf8");
assert.match(html, /type="module" src="\.\/app\.js"/);
assert.equal((html.match(/role="tab"/g) || []).length, 3);
for (const name of await readdir(new URL("data", root))) assert.ok(["profile.json", "profile.js"].includes(name), "Only allowlisted snapshots belong in data/");
console.log(`Static profile check passed: ${snapshot.repositories.length} public repositories, ${snapshot.starred.length} stars, ${snapshot.contributions.days.length} real contribution dates.`);
