import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseContributions, parseProfileHTML, sanitizeProfile, sanitizeRepository, validateSnapshot } from "./profile-data.mjs";
import { fetchPages, githubRequest, newestValidSnapshot, refreshProfile } from "./update-profile.mjs";
import { calendarWeeks, calendarMonthLabels, escapeHTML, safeURL, selectRepositories } from "../lib/profile-view.js";

const snapshot = JSON.parse(await readFile(new URL("../data/profile.json", import.meta.url), "utf8"));
const profileHTML = await readFile(new URL("fixtures/profile.html", import.meta.url), "utf8");
const calendarHTML = await readFile(new URL("fixtures/calendar.html", import.meta.url), "utf8");
const expectedPins = ["daoyi2026/my-studio", "daoyi2026/vibe-coding-zero-to-ship", "daoyi2026/dunhuang-sky", "daoyi2026/kinetic-life-os", "daoyi2026/her-dynasty", "hemanth/awesome-pwa"];

function rawRepository(repo) {
  return {
    name: repo.name, full_name: repo.fullName, owner: { login: repo.owner }, html_url: repo.url,
    private: false, visibility: "public", description: repo.description, language: repo.language,
    stargazers_count: repo.stars, forks_count: repo.forks, fork: repo.fork, archived: repo.archived,
    topics: repo.topics, updated_at: repo.updatedAt, homepage: repo.homepage, ignored_secret: "DO_NOT_PUBLISH",
  };
}

function fullCalendarHTML() {
  return `<h2 id="js-contribution-activity-description">${snapshot.contributions.total} contributions in the last year</h2>`
    + snapshot.contributions.days.map((day, index) => `<td data-date="${day.date}" data-level="${day.level}" id="day-${index}"></td><tool-tip for="day-${index}">${day.count ? day.count : "No"} contribution${day.count === 1 ? "" : "s"} on a public date.</tool-tip>`).join("");
}

test("public profile fixture preserves actual pin order, foreign owner, and status", () => {
  const parsed = parseProfileHTML(profileHTML);
  assert.deepEqual(parsed.pins, expectedPins);
  assert.equal(parsed.status.emoji, "🏄‍♀️");
  assert.equal(parsed.status.message, "On an adventure");
  assert.equal(parsed.achievements[0].title, "YOLO");
  assert.throws(() => parseProfileHTML("Please sign in"), /pins missing/);
});

test("real contribution markup uses per-day counts, levels, dates, and checked total", () => {
  const result = parseContributions(calendarHTML, { minDays: 3 });
  assert.deepEqual(result.days.map((day) => day.count), [0, 1, 2]);
  assert.equal(result.total, 3);
  assert.equal(result.from, "2026-10-16");
  assert.equal(result.to, "2026-10-18");
  assert.throws(() => parseContributions(calendarHTML), /Incomplete/);
  assert.throws(() => parseContributions(calendarHTML.replace("3 contributions in", "4 contributions in"), { minDays: 3 }), /total/);
  assert.throws(() => parseContributions(calendarHTML.replace('for="contribution-day-component-6-0"', 'for="missing"'), { minDays: 3 }), /markup/);
  assert.throws(() => parseContributions(calendarHTML.replace("2026-10-17", "2026-10-16"), { minDays: 3 }), /Incomplete/);
});

test("public field allowlist drops credentials, email, and private repositories", () => {
  const raw = rawRepository(snapshot.repositories[0]);
  assert.equal(sanitizeRepository({ ...raw, private: true }), null);
  assert.equal(sanitizeRepository({ ...raw, visibility: "private" }), null);
  assert.equal(sanitizeRepository(raw).ignored_secret, undefined);
  assert.throws(() => sanitizeRepository({ ...raw, html_url: "javascript:alert(1)" }), /URL/);
  assert.equal(sanitizeProfile({ login: "daoyi2026", email: "DO_NOT_PUBLISH", plan: "DO_NOT_PUBLISH" }).email, undefined);
  assert.equal(safeURL("javascript:alert(1)"), null);
  assert.equal(safeURL("https://name:secret@github.com/"), null);
  assert.equal(escapeHTML('<img onerror="alert(1)">'), "&lt;img onerror=&quot;alert(1)&quot;&gt;");
});

test("repository selection includes forks and searches descriptions/topics with explicit sorts", () => {
  const base = snapshot.repositories[0];
  const repos = [
    { ...base, name: "zeta", fullName: "daoyi2026/zeta", fork: false, description: "A quiet project", topics: ["health"], language: "HTML", updatedAt: "2026-10-01T00:00:00Z", stars: 8 },
    { ...base, name: "alpha", fullName: "daoyi2026/alpha", fork: true, description: "Public fork", topics: ["offline"], language: null, updatedAt: "2026-10-03T00:00:00Z", stars: 2 },
    { ...base, name: "beta", fullName: "daoyi2026/beta", fork: false, description: "Quiet offline work", topics: [], language: "JavaScript", updatedAt: "2026-10-02T00:00:00Z", stars: 4 },
  ];
  assert.equal(selectRepositories(repos).length, 3);
  assert.deepEqual(selectRepositories(repos, { type: "forks" }).map((repo) => repo.name), ["alpha"]);
  assert.deepEqual(selectRepositories(repos, { query: "quiet" }).map((repo) => repo.name), ["beta", "zeta"]);
  assert.equal(selectRepositories(repos, { query: "health" })[0].name, "zeta");
  assert.equal(selectRepositories(repos, { language: "none" })[0].name, "alpha");
  assert.equal(selectRepositories(repos, { language: "HTML" })[0].name, "zeta");
  assert.deepEqual(selectRepositories(repos, { sort: "name" }).map((repo) => repo.name), ["alpha", "beta", "zeta"]);
  assert.deepEqual(selectRepositories(repos, { sort: "stars" }).map((repo) => repo.name), ["zeta", "beta", "alpha"]);
  assert.equal(selectRepositories(repos, { query: "not-present" }).length, 0);
  assert.equal(repos[0].name, "zeta", "Sorting must not mutate snapshot order");
});

test("calendar keeps actual dates and avoids adjacent initial month labels", () => {
  const weeks = calendarWeeks(snapshot.contributions.days);
  assert.equal(weeks.flat().filter(Boolean).length, snapshot.contributions.days.length);
  const dates = Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.UTC(2025, 9, 19 + index)).toISOString().slice(0, 10), count: 0, level: 0 }));
  const labels = calendarMonthLabels(calendarWeeks(dates));
  assert.equal(labels.get(0), "Oct");
  assert.equal(labels.get(2), "Nov");
  assert.equal(labels.has(1), false);
  const shortStart = dates.slice(12);
  assert.equal(calendarMonthLabels(calendarWeeks(shortStart)).has(0), false);
});

test("API pagination reads all pages and rejects a foreign next-page host", async () => {
  let calls = 0;
  const result = await fetchPages("https://api.github.com/page1", async () => {
    calls += 1;
    return new Response(JSON.stringify([calls]), { headers: calls === 1 ? { link: '<https://api.github.com/page2>; rel="next"' } : {} });
  });
  assert.deepEqual(result, [1, 2]);
  await assert.rejects(fetchPages("https://api.github.com/page1", async () => new Response("[]", { headers: { link: '<https://example.com/steal>; rel="next"' } })), /pagination/);
});

test("Actions credentials reach only the public REST build requests", async () => {
  const saved = { actions: process.env.GITHUB_ACTIONS, token: process.env.GITHUB_TOKEN };
  const seen = [];
  const fetchImpl = async (url, options) => { seen.push({ url, headers: options.headers }); return new Response("{}"); };
  try {
    process.env.GITHUB_ACTIONS = "true"; process.env.GITHUB_TOKEN = "test-only-not-a-real-token";
    await githubRequest("https://api.github.com/users/daoyi2026", { fetchImpl });
    await githubRequest("https://github.com/daoyi2026", { fetchImpl });
    await githubRequest("https://avatars.githubusercontent.com/u/270243353", { fetchImpl });
    assert.equal(seen[0].headers.Authorization, "Bearer test-only-not-a-real-token");
    assert.equal(seen[1].headers.Authorization, undefined);
    assert.equal(seen[2].headers.Authorization, undefined);
    process.env.GITHUB_ACTIONS = "false";
    await githubRequest("https://api.github.com/users/daoyi2026", { fetchImpl });
    assert.equal(seen[3].headers.Authorization, undefined);
    await assert.rejects(githubRequest("https://other.example/", { fetchImpl }), /Unapproved/);
  } finally {
    for (const [key, value] of [["GITHUB_ACTIONS", saved.actions], ["GITHUB_TOKEN", saved.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

function requestFixture({ fail = "", malformedCalendar = false } = {}) {
  const user = { login: "daoyi2026", name: "daoyi", followers: 3, following: 2, public_repos: snapshot.repositories.length, avatar_url: "https://avatars.githubusercontent.com/u/270243353?v=4", email: "DO_NOT_PUBLISH" };
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3S8AAAAASUVORK5CYII=", "base64");
  return async (url) => {
    if (fail && url.includes(fail)) throw new Error("Simulated upstream interruption");
    if (url.includes("githubassets.com") || url.includes("avatars.githubusercontent.com")) return new Response(image, { headers: { "content-type": "image/png" } });
    if (url.includes("/contributions")) return new Response(malformedCalendar ? "Please retry" : fullCalendarHTML());
    if (url === "https://github.com/daoyi2026") return new Response(profileHTML);
    if (url.includes("/repos?")) return new Response(JSON.stringify(snapshot.repositories.map(rawRepository)));
    if (url.includes("/starred?")) return new Response(JSON.stringify(snapshot.starred.map(rawRepository)));
    if (url.includes("/repos/")) return new Response(JSON.stringify(rawRepository(snapshot.pinned.find((repo) => url.endsWith(repo.fullName)))));
    return new Response(JSON.stringify(user));
  };
}

async function temporarySnapshot(run) {
  const root = await mkdtemp(join(tmpdir(), "daoyi-profile-test-"));
  await mkdir(join(root, "data"));
  const originalJSON = JSON.stringify(snapshot);
  await writeFile(join(root, "data/profile.json"), originalJSON);
  await writeFile(join(root, "data/profile.js"), "original module");
  try { await run(root, originalJSON); } finally { await rm(root, { recursive: true, force: true }); }
}

test("critical source failure leaves both successful local snapshot files untouched", async () => {
  await temporarySnapshot(async (root, original) => {
    await assert.rejects(refreshProfile({ root, request: requestFixture({ fail: "/starred?" }) }), /interruption/);
    assert.equal(await readFile(join(root, "data/profile.json"), "utf8"), original);
    assert.equal(await readFile(join(root, "data/profile.js"), "utf8"), "original module");
  });
});

test("empty repository responses and truncated calendars cannot replace good data", async () => {
  await temporarySnapshot(async (root, original) => {
    const request = requestFixture();
    await assert.rejects(refreshProfile({ root, request: (url) => url.includes("/starred?") ? new Response("[]") : request(url) }), /Incomplete/);
    assert.equal(await readFile(join(root, "data/profile.json"), "utf8"), original);
  });
  const days = snapshot.contributions.days.slice(0, 350);
  assert.throws(() => validateSnapshot({ ...snapshot, contributions: { ...snapshot.contributions, days, to: days.at(-1).date, total: days.reduce((sum, day) => sum + day.count, 0) } }), /calendar/);
});

test("missing calendar retains real prior dates with original freshness and a visible notice", async () => {
  await temporarySnapshot(async (root) => {
    const updated = await refreshProfile({ root, request: requestFixture({ malformedCalendar: true }), now: "2026-10-19T00:00:00Z" });
    assert.deepEqual(updated.contributions, snapshot.contributions);
    assert.equal(updated.notices.length, 1);
    assert.equal(updated.contributions.fetchedAt, snapshot.contributions.fetchedAt);
    const published = await readFile(join(root, "data/profile.json"), "utf8");
    assert.ok(!published.includes("DO_NOT_PUBLISH"));
    assert.deepEqual(updated.pinned.map((repo) => repo.fullName), expectedPins);
  });
});

test("successful public refresh contains actual arrays and matching JSON/module snapshots", async () => {
  await temporarySnapshot(async (root) => {
    const updated = await refreshProfile({ root, request: requestFixture() });
    validateSnapshot(updated);
    assert.equal(updated.repositories.length, snapshot.repositories.length);
    assert.equal(updated.repositories.filter((repo) => repo.fork).length, snapshot.repositories.filter((repo) => repo.fork).length);
    const json = await readFile(join(root, "data/profile.json"), "utf8");
    const module = await readFile(join(root, "data/profile.js"), "utf8");
    assert.ok(!json.includes("DO_NOT_PUBLISH"));
    assert.deepEqual(JSON.parse(module.slice(module.indexOf("export default ") + 15, -2)), JSON.parse(json));
  });
});

test("fallback selection keeps newest valid published data and rejects empty replacements", () => {
  const later = { ...snapshot, syncedAt: "2099-01-01T00:00:00Z" };
  assert.equal(newestValidSnapshot(snapshot, later), later);
  assert.equal(newestValidSnapshot(snapshot, { ...later, repositories: [] }), snapshot);
  assert.equal(newestValidSnapshot(null, null), null);
});
