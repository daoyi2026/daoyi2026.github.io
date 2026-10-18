export const USERNAME = "daoyi2026";

export function decodeHTML(value = "") {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return named[entity.toLowerCase()];
  });
}

export function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1], decodeHTML(match[2] ?? match[3])]));
}

const plain = (value) => decodeHTML(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const text = (value, max = 10000) => typeof value === "string" ? value.slice(0, max) : "";
const integer = (value) => Number.isInteger(value) && value >= 0 ? value : 0;

export function httpURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function sanitizeRepository(repo) {
  if (!repo || repo.private !== false || repo.visibility && repo.visibility !== "public") return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo.full_name || "")) throw new Error("Invalid public repository name");
  const url = httpURL(repo.html_url);
  if (url !== `https://github.com/${repo.full_name}`) throw new Error("Invalid public repository URL");
  if (!Number.isFinite(Date.parse(repo.updated_at))) throw new Error("Repository update time missing");
  return {
    name: text(repo.name, 100), fullName: repo.full_name, owner: text(repo.owner?.login, 100), url,
    description: text(repo.description), language: text(repo.language, 80) || null,
    stars: integer(repo.stargazers_count), forks: integer(repo.forks_count),
    fork: repo.fork === true, archived: repo.archived === true,
    topics: (Array.isArray(repo.topics) ? repo.topics : []).filter((topic) => /^[a-z0-9-]+$/i.test(topic)),
    updatedAt: repo.updated_at, homepage: httpURL(repo.homepage),
  };
}

export function sanitizeProfile(user) {
  if (user?.login?.toLowerCase() !== USERNAME) throw new Error("Unexpected profile account");
  return {
    login: USERNAME, name: text(user.name, 200) || USERNAME, url: `https://github.com/${USERNAME}`,
    bio: text(user.bio), location: text(user.location, 200), blog: httpURL(user.blog),
    followers: integer(user.followers), following: integer(user.following), publicRepos: integer(user.public_repos),
    avatarAsset: "",
  };
}

export function parseProfileHTML(html) {
  const pins = [];
  for (const match of html.matchAll(/<li\b[^>]*class="[^"]*\bpinned-item-list-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const repoLink = [...match[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .find((link) => /class="repo"/.test(link[2]));
    const href = repoLink && attributes(repoLink[1]).href;
    if (!/^\/[\w.-]+\/[\w.-]+$/.test(href || "")) throw new Error("Pinned repository markup changed");
    pins.push(href.slice(1));
  }
  if (!pins.length || pins.length > 6 || new Set(pins).size !== pins.length) throw new Error("Public pins missing or invalid");
  const emoji = html.match(/class="user-status-emoji-container[^\"]*"[^>]*>\s*<div>([\s\S]*?)<\/div>/i);
  const message = html.match(/class="user-status-message-wrapper[^\"]*"[^>]*>\s*<div>([\s\S]*?)<\/div>/i);
  const achievements = [];
  for (const match of html.matchAll(/<img\b([^>]*class="achievement-badge-sidebar"[^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    const source = httpURL(attrs.src);
    if (!source || new URL(source).hostname !== "github.githubassets.com") continue;
    const slug = attrs["data-hovercard-url"]?.match(/\/achievements\/([\w-]+)\//)?.[1];
    if (slug && !achievements.some((badge) => badge.slug === slug)) achievements.push({
      slug, title: (attrs.alt || "").replace(/^Achievement:\s*/, ""), source,
      url: `https://github.com/${USERNAME}?achievement=${slug}&tab=achievements`,
    });
  }
  return { pins, status: emoji && message ? { emoji: plain(emoji[1]), message: plain(message[1]) } : null, achievements };
}

export function parseContributions(html, { minDays = 364 } = {}) {
  const tips = new Map([...html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/gi)]
    .map((match) => [attributes(match[1]).for, plain(match[2])]));
  const days = [];
  for (const match of html.matchAll(/<td\b([^>]*\bdata-date=[^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    const label = tips.get(attrs.id);
    const countMatch = label?.match(/^(No|[\d,]+) contributions? on /i);
    const level = Number(attrs["data-level"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attrs["data-date"] || "") || !countMatch || !Number.isInteger(level) || level < 0 || level > 4) throw new Error("Contribution cell markup changed");
    const count = countMatch[1] === "No" ? 0 : Number(countMatch[1].replaceAll(",", ""));
    if (!Number.isSafeInteger(count) || (count === 0) !== (level === 0)) throw new Error("Invalid public contribution count");
    days.push({ date: attrs["data-date"], count, level });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < minDays || days.length > 371 || new Set(days.map((day) => day.date)).size !== days.length) throw new Error("Incomplete public contribution calendar");
  days.forEach((day, index) => {
    if (index && Date.parse(day.date) - Date.parse(days[index - 1].date) !== 86400000) throw new Error("Contribution dates are not continuous");
  });
  const heading = plain(html.match(/<h2\b[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "");
  const declared = heading.match(/^([\d,]+) contributions?\b/);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  if (!declared || total !== Number(declared[1].replaceAll(",", ""))) throw new Error("Public contribution total does not match cells");
  return { from: days[0].date, to: days.at(-1).date, total, days };
}

export function validateSnapshot(data) {
  if (data?.schemaVersion !== 1 || data.profile?.login !== USERNAME || !Number.isFinite(Date.parse(data.syncedAt))) throw new Error("Invalid profile snapshot");
  for (const key of ["repositories", "starred", "pinned"]) {
    if (!Array.isArray(data[key]) || !data[key].length) throw new Error(`Empty ${key} snapshot refused`);
    if (new Set(data[key].map((repo) => repo.fullName)).size !== data[key].length) throw new Error(`Duplicate ${key} repositories`);
    data[key].forEach((repo) => {
      if (repo.url !== `https://github.com/${repo.fullName}` || !httpURL(repo.url)) throw new Error("Unsafe repository link");
      if (key === "repositories" && repo.owner.toLowerCase() !== USERNAME) throw new Error("Unowned repository in owned list");
    });
  }
  if (!/^assets\/[\w.-]+\.(png|jpg|webp)$/.test(data.profile.avatarAsset)) throw new Error("Local avatar missing");
  const calendar = data.contributions;
  if (!calendar || calendar.days?.length < 364 || calendar.days.length > 371 || calendar.total !== calendar.days.reduce((sum, day) => sum + day.count, 0) || !Number.isFinite(Date.parse(calendar.fetchedAt))) throw new Error("Invalid calendar snapshot");
  calendar.days.forEach((day, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isSafeInteger(day.count) || day.count < 0 || !Number.isInteger(day.level) || day.level < 0 || day.level > 4 || (day.count === 0) !== (day.level === 0)) throw new Error("Invalid contribution day");
    if (index && Date.parse(day.date) - Date.parse(calendar.days[index - 1].date) !== 86400000) throw new Error("Incomplete contribution date sequence");
  });
  if (calendar.from !== calendar.days[0].date || calendar.to !== calendar.days.at(-1).date) throw new Error("Calendar bounds do not match dates");
  return data;
}
