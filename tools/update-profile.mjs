import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { USERNAME, parseContributions, parseProfileHTML, sanitizeProfile, sanitizeRepository, validateSnapshot } from "./profile-data.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const API = "https://api.github.com";
const PROFILE = `https://github.com/${USERNAME}`;
const CALENDAR = `https://github.com/users/${USERNAME}/contributions`;

export async function githubRequest(url, { fetchImpl = fetch } = {}) {
  const parsed = new URL(url);
  if (!["api.github.com", "github.com", "avatars.githubusercontent.com", "github.githubassets.com"].includes(parsed.hostname) || parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Unapproved public source URL");
  const headers = { "User-Agent": "daoyi2026-public-profile-snapshot" };
  if (parsed.hostname === "api.github.com") {
    headers.Accept = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
    // Credentials are used only by the Actions build, never anonymous HTML or assets.
    if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  } else headers.Accept = parsed.hostname === "github.com" ? "text/html" : "image/*";
  const response = await fetchImpl(url, { headers, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Public source returned HTTP ${response.status}: ${parsed.hostname}${parsed.pathname}`);
  return response;
}

export async function fetchPages(url, request = githubRequest) {
  const collected = [];
  const seen = new Set();
  for (let page = 0; url; page += 1) {
    if (page >= 100 || seen.has(url) || new URL(url).origin !== API) throw new Error("Invalid API pagination");
    seen.add(url);
    const response = await request(url);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("Repository API did not return a list");
    collected.push(...items);
    url = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  return collected;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, contents);
  await rename(temp, path);
}

export function newestValidSnapshot(local, published) {
  let chosen = null;
  for (const candidate of [local, published]) {
    try {
      validateSnapshot(candidate);
      if (!chosen || Date.parse(candidate.syncedAt) > Date.parse(chosen.syncedAt)) chosen = candidate;
    } catch { /* An incomplete or empty fallback never replaces a good snapshot. */ }
  }
  return chosen;
}

export async function refreshProfile({ root = ROOT, request = githubRequest, now = new Date().toISOString(), publishedSnapshot = null } = {}) {
  const local = await readFile(resolve(root, "data/profile.json"), "utf8").then(JSON.parse).catch(() => null);
  const previous = newestValidSnapshot(local, publishedSnapshot);
  const [userResponse, rawRepos, rawStarred, profileResponse] = await Promise.all([
    request(`${API}/users/${USERNAME}`),
    fetchPages(`${API}/users/${USERNAME}/repos?type=owner&sort=updated&per_page=100`, request),
    fetchPages(`${API}/users/${USERNAME}/starred?per_page=100`, request),
    request(PROFILE),
  ]);
  const user = await userResponse.json();
  const profile = sanitizeProfile(user);
  const publicProfile = parseProfileHTML(await profileResponse.text());
  const repositories = rawRepos.map(sanitizeRepository).filter((repo) => repo && repo.owner.toLowerCase() === USERNAME);
  const starred = rawStarred.map(sanitizeRepository).filter(Boolean);
  if (repositories.length < profile.publicRepos || !repositories.length || !starred.length) throw new Error("Incomplete public repository data; previous snapshot retained");
  const byName = new Map([...repositories, ...starred].map((repo) => [repo.fullName.toLowerCase(), repo]));
  const pinned = [];
  for (const fullName of publicProfile.pins) {
    let repo = byName.get(fullName.toLowerCase());
    if (!repo) repo = sanitizeRepository(await (await request(`${API}/repos/${fullName}`)).json());
    if (!repo) throw new Error("Pinned repository is not public");
    pinned.push(repo);
  }

  const notices = [];
  let contributions;
  try {
    const parsed = parseContributions(await (await request(CALENDAR)).text());
    contributions = { ...parsed, fetchedAt: now, sourceUrl: CALENDAR };
  } catch (error) {
    if (!previous?.contributions) throw error;
    validateSnapshot(previous);
    const retained = previous.contributions;
    contributions = {
      from: retained.from, to: retained.to, total: retained.total,
      days: retained.days.map(({ date, count, level }) => ({ date, count, level })),
      fetchedAt: retained.fetchedAt, sourceUrl: CALENDAR,
    };
    notices.push("Contribution calendar retained from its last successful public sync.");
  }

  const assets = new Map();
  async function localImage(url, label) {
    const response = await request(url);
    const mime = response.headers.get("content-type")?.split(";")[0];
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime];
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!extension || !bytes.length || bytes.length > 3000000) throw new Error("Invalid public image asset");
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const path = `assets/${label}-${digest}.${extension}`;
    assets.set(path, bytes);
    return path;
  }
  const avatar = new URL(user.avatar_url);
  if (avatar.hostname !== "avatars.githubusercontent.com") throw new Error("Unexpected avatar source");
  avatar.searchParams.set("s", "592");
  profile.avatarAsset = await localImage(avatar.href, "avatar");
  const achievements = await Promise.all(publicProfile.achievements.map(async ({ source, ...badge }) => ({
    ...badge, asset: await localImage(source, `achievement-${badge.slug}`),
  })));
  const snapshot = validateSnapshot({
    schemaVersion: 1, syncedAt: now, profile, status: publicProfile.status, achievements,
    pinned, repositories, starred, contributions, notices,
    sources: { profile: PROFILE, repositories: `${API}/users/${USERNAME}/repos`, starred: `${API}/users/${USERNAME}/starred`, pinsFetchedAt: now, repositoriesFetchedAt: now },
  });

  // Nothing is written until all required sources and public-field guards pass.
  for (const [path, bytes] of assets) await atomicWrite(resolve(root, path), bytes);
  const json = JSON.stringify(snapshot, null, 2) + "\n";
  const module = "// Generated from public GitHub sources. Do not add credentials.\nexport default "
    + JSON.stringify(snapshot).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029") + ";\n";
  await atomicWrite(resolve(root, "data/profile.json"), json);
  await atomicWrite(resolve(root, "data/profile.js"), module);
  return snapshot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let publishedSnapshot = null;
    if (process.env.GITHUB_ACTIONS === "true") {
      // Scheduled builds start from Git, so recover the latest published JSON
      // as the calendar fallback rather than silently reverting to bootstrap data.
      try {
        const response = await fetch("https://daoyi2026.github.io/data/profile.json", { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10000) });
        if (response.ok) publishedSnapshot = await response.json();
      } catch { /* The checked-in successful JSON remains the local fallback. */ }
    }
    const snapshot = await refreshProfile({ publishedSnapshot });
    console.log(`Public snapshot ready: ${snapshot.repositories.length} repositories, ${snapshot.starred.length} starred, ${snapshot.pinned.length} pins, ${snapshot.contributions.total} contributions.`);
    if (snapshot.notices.length) console.log(snapshot.notices.join(" "));
  } catch (error) {
    console.error(`Profile refresh failed; existing snapshot was not replaced. ${error.message}`);
    process.exitCode = 1;
  }
}
