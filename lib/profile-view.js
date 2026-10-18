export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function selectRepositories(repositories, { query = "", language = "all", type = "all", sort = "updated" } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const result = repositories.filter((repo) => {
    const searchable = [repo.name, repo.fullName, repo.description, ...repo.topics].join(" ").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term))
      && (language === "all" || (language === "none" ? !repo.language : repo.language === language))
      && (type === "all" || type === "forks" && repo.fork || type === "sources" && !repo.fork || type === "archived" && repo.archived);
  });
  const name = (a, b) => a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base", numeric: true });
  return result.sort(sort === "name" ? name : sort === "stars"
    ? (a, b) => b.stars - a.stars || name(a, b)
    : (a, b) => b.updatedAt.localeCompare(a.updatedAt) || name(a, b));
}

export function calendarWeeks(days) {
  const offset = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const padded = [...Array(offset).fill(null), ...days];
  while (padded.length % 7) padded.push(null);
  return Array.from({ length: padded.length / 7 }, (_, week) => padded.slice(week * 7, week * 7 + 7));
}

export function calendarMonthLabels(weeks) {
  const labels = new Map();
  let lastMonth = "";
  weeks.forEach((week, index) => {
    const day = week[0] || (index === 0 ? week.find(Boolean) : null);
    if (!day || day.date.slice(0, 7) === lastMonth) return;
    lastMonth = day.date.slice(0, 7);
    labels.set(index, new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`)));
  });
  const [first, second] = labels.keys();
  if (second !== undefined && second - first < 2) labels.delete(first);
  return labels;
}

export function fullDate(date) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

export function contributionLabel(day) {
  return `${day.count === 0 ? "No" : day.count.toLocaleString("en")} contribution${day.count === 1 ? "" : "s"} on ${fullDate(day.date)}`;
}
