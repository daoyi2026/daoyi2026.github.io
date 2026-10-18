import { cp, mkdir, rm } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish a small allowlist; build tooling, fixtures, and credentials stay out.
for (const path of ["index.html", "style.css", "app.js", "lib", "assets", "data", ".nojekyll"]) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true });
}
console.log("Static Pages artifact built in dist/.");
