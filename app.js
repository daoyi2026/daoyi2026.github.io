import snapshot from "./data/profile.js";
import { escapeHTML as esc, safeURL, selectRepositories, calendarWeeks, calendarMonthLabels, contributionLabel, fullDate } from "./lib/profile-view.js";

const icons = {
  overview: '<path d="M2 2h5a2 2 0 0 1 2 2v10a3 3 0 0 0-3-2H2zM9 4a2 2 0 0 1 2-2h3v10h-3a3 3 0 0 0-2 2"/>',
  repo: '<path d="M3 1.5h10v13H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM3 10.5h10M5 4h5M5 6.5h4"/>',
  star: '<path d="m8 1 2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8 3.8 14l.8-4.7L1.2 6l4.7-.7Z"/>',
  fork: '<circle cx="4" cy="2.5" r="1.5"/><circle cx="12" cy="2.5" r="1.5"/><circle cx="8" cy="13.5" r="1.5"/><path d="M4 4v2a4 4 0 0 0 4 4v2M12 4v2a4 4 0 0 1-4 4"/>',
  people: '<circle cx="6" cy="5" r="2.5"/><path d="M1.5 14v-1a4.5 4.5 0 0 1 9 0v1M11 3a2.5 2.5 0 0 1 0 5M12 10a4 4 0 0 1 2.5 4"/>',
  project: '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M6 2v12M10 2v12"/>',
  package: '<path d="m8 1 6 3.5v7L8 15l-6-3.5v-7ZM2 4.5 8 8l6-3.5M8 8v7M5 2.8l6 3.5"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${icons[name] || icons.repo}</svg>`;
const link = (url, label, attrs = "") => safeURL(url) ? `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer" ${attrs}>${label}</a>` : label;
const compact = (number) => number >= 1000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number).toLowerCase() : number.toLocaleString("en");
const languageColors = { JavaScript: "#f1e05a", HTML: "#e34c26", CSS: "#563d7c", Python: "#3572a5", Shell: "#89e051", TypeScript: "#3178c6", Swift: "#f05138" };
const profile = snapshot.profile;
const view = document.querySelector("#profile-view");
let activeTab = "overview";
const filters = { repositories: { query: "", language: "all", type: "all", sort: "updated" }, stars: { query: "", language: "all", type: "all", sort: "updated" } };

function repoName(repo) {
  return repo.owner.toLowerCase() === profile.login ? esc(repo.name) : `<span class="repo-owner">${esc(repo.owner)}/</span>${esc(repo.name)}`;
}

function repositoryMeta(repo, { updated = false } = {}) {
  const language = repo.language ? `<span class="language"><span class="language-dot" style="--language-color:${languageColors[repo.language] || "#6e7781"}"></span>${esc(repo.language)}</span>` : "";
  return `<div class="repo-meta">${language}${repo.stars ? link(`${repo.url}/stargazers`, `${icon("star")} ${compact(repo.stars)}`, `title="${repo.stars.toLocaleString("en")} stars"`) : ""}${repo.forks ? link(`${repo.url}/forks`, `${icon("fork")} ${compact(repo.forks)}`, `title="${repo.forks.toLocaleString("en")} forks"`) : ""}${updated ? `<span>Updated ${esc(fullDate(repo.updatedAt))}</span>` : ""}</div>`;
}

function renderSidebar() {
  document.querySelector("#profile-sidebar").innerHTML = `
    <div class="avatar-wrap">${link(profile.url, `<img class="avatar" src="${esc(profile.avatarAsset)}" width="296" height="296" alt="${esc(profile.login)}'s avatar" />`, 'class="avatar-link" aria-label="Open original GitHub profile"')}${snapshot.status ? `<span class="user-status" title="${esc(snapshot.status.message)}" aria-label="${esc(snapshot.status.message)}">${esc(snapshot.status.emoji)}</span>` : ""}</div>
    <h1 class="profile-name">${esc(profile.name)}</h1><p class="profile-login">${esc(profile.login)}</p>
    ${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ""}
    ${link(profile.url, "Follow", 'class="follow-button" aria-label="Follow daoyi2026 on GitHub in a new tab"')}
    <div class="profile-followers">${icon("people")} ${link(`${profile.url}?tab=followers`, `<strong>${profile.followers.toLocaleString("en")}</strong> followers`)} · ${link(`${profile.url}?tab=following`, `<strong>${profile.following.toLocaleString("en")}</strong> following`)}</div>
    ${profile.location ? `<p class="profile-detail">${esc(profile.location)}</p>` : ""}${profile.blog ? `<p class="profile-detail">${link(profile.blog, esc(profile.blog.replace(/^https?:\/\//, "")))}</p>` : ""}
    ${snapshot.achievements.length ? `<section class="profile-achievements"><h2>${link(`${profile.url}?tab=achievements`, "Achievements")}</h2><div class="achievement-list">${snapshot.achievements.map((badge) => link(badge.url, `<img src="${esc(badge.asset)}" width="64" height="64" alt="Achievement: ${esc(badge.title)}" />`, `title="${esc(badge.title)}"`)).join("")}</div></section>` : ""}
    <div class="sidebar-source">${link(profile.url, "View profile on GitHub ↗")}</div>`;
}

function renderCalendar() {
  const calendar = snapshot.contributions;
  const weeks = calendarWeeks(calendar.days);
  const monthLabels = calendarMonthLabels(weeks);
  return `<section class="contributions" aria-labelledby="contribution-title"><h2 id="contribution-title" class="section-title">${calendar.total.toLocaleString("en")} contributions in the last year</h2>
    <div class="calendar-card"><div class="calendar-scroll"><table class="calendar-table" style="width:${weeks.length * 15 + 37}px" role="grid" aria-readonly="true" aria-label="Public GitHub contributions"><caption class="sr-only">${esc(fullDate(calendar.from))} to ${esc(fullDate(calendar.to))}. Use arrow keys to explore dates.</caption><colgroup><col style="width:29px" />${weeks.map(() => '<col style="width:11px" />').join("")}</colgroup>
    <thead><tr><td class="day-label"></td>${weeks.map((_, index) => `<td>${esc(monthLabels.get(index) || "")}</td>`).join("")}</tr></thead>
    <tbody>${Array.from({ length: 7 }, (_, weekday) => `<tr><th scope="row" class="day-label">${["", "Mon", "", "Wed", "", "Fri", ""][weekday]}</th>${weeks.map((week) => {
      const day = week[weekday];
      if (!day) return '<td aria-hidden="true"></td>';
      const label = contributionLabel(day);
      return `<td role="gridcell"><button type="button" class="contribution-day" data-date="${day.date}" data-level="${day.level}" tabindex="${day.date === calendar.to ? "0" : "-1"}" aria-label="${esc(label)}" title="${esc(label)}"></button></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="calendar-footer">${link("https://docs.github.com/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile", "Learn how we count contributions")}<div class="calendar-legend" aria-label="Contribution intensity from less to more"><span>Less</span>${[0, 1, 2, 3, 4].map((level) => `<span class="legend-square" data-level="${level}" aria-hidden="true"></span>`).join("")}<span>More</span></div></div></div>
    <div id="contribution-detail" class="contribution-detail" hidden aria-live="polite"></div>
    ${snapshot.notices.length ? `<p class="calendar-freshness">Calendar last synced ${esc(new Date(calendar.fetchedAt).toLocaleString("en", { timeZone: "UTC" }))} UTC.</p>` : ""}</section>`;
}

function renderOverview() {
  view.innerHTML = `<section aria-labelledby="pinned-title"><h2 id="pinned-title" class="section-title">Pinned</h2><ol class="pinned-grid">${snapshot.pinned.map((repo) => `<li class="pinned-card"><h3 class="repo-heading">${icon("repo")}${link(repo.url, repoName(repo))}<span class="visibility">Public</span></h3><p class="repo-description">${esc(repo.description)}</p>${repositoryMeta(repo)}</li>`).join("")}</ol></section>${renderCalendar()}`;
}

function renderRepositoryList() {
  const state = filters[activeTab];
  const all = activeTab === "stars" ? snapshot.starred : snapshot.repositories;
  const result = selectRepositories(all, state);
  document.querySelector("#repository-results").innerHTML = result.length ? `<ul class="repository-list">${result.map((repo) => `<li class="repository-row"><h2 class="repo-heading">${link(repo.url, repoName(repo))}<span class="visibility">${repo.archived ? "Public archive" : repo.fork ? "Public fork" : "Public"}</span></h2>${repo.description ? `<p class="repo-description">${esc(repo.description)}</p>` : ""}${repo.topics.length ? `<div class="topic-list">${repo.topics.map((topic) => link(`https://github.com/topics/${encodeURIComponent(topic)}`, esc(topic), 'class="topic"')).join("")}</div>` : ""}${repositoryMeta(repo, { updated: true })}${link(repo.url, `${icon("star")} Star on GitHub`, 'class="star-link"')}</li>`).join("")}</ul>` : '<div class="empty-state">No repositories match these filters. Try another search, language, or type.</div>';
  document.querySelector("#results-summary").textContent = `${result.length} of ${all.length} ${activeTab === "stars" ? "public starred" : "public owned"} repositories${state.query ? ` matching “${state.query}”` : ""}.`;
}

function renderRepositories() {
  const all = activeTab === "stars" ? snapshot.starred : snapshot.repositories;
  const state = filters[activeTab];
  const languages = [...new Set(all.map((repo) => repo.language).filter(Boolean))].sort();
  view.innerHTML = `<h1 class="sr-only">${activeTab === "stars" ? "Starred repositories" : "Public repositories"}</h1><div class="filter-bar" role="search" aria-label="Filter public repositories"><label class="sr-only" for="repo-query">Search names, descriptions, and topics</label><input id="repo-query" class="repo-search" type="search" placeholder="Find a repository…" value="${esc(state.query)}" />
    <label>Type <select id="repo-type"><option value="all">All</option><option value="sources">Sources</option><option value="forks">Forks</option><option value="archived">Archived</option></select></label>
    <label>Language <select id="repo-language"><option value="all">All</option>${languages.map((language) => `<option value="${esc(language)}">${esc(language)}</option>`).join("")}${all.some((repo) => !repo.language) ? '<option value="none">Not specified</option>' : ""}</select></label>
    <label>Sort <select id="repo-sort"><option value="updated">Updated</option><option value="name">Name</option><option value="stars">Stars</option></select></label></div><p id="results-summary" class="results-summary" aria-live="polite"></p><div id="repository-results"></div>`;
  document.querySelector("#repo-type").value = state.type;
  document.querySelector("#repo-language").value = state.language;
  document.querySelector("#repo-sort").value = state.sort;
  renderRepositoryList();
}

function showTab(tab) {
  activeTab = ["overview", "repositories", "stars"].includes(tab) ? tab : "overview";
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === activeTab));
    button.tabIndex = button.dataset.tab === activeTab ? 0 : -1;
  });
  view.setAttribute("aria-labelledby", `tab-${activeTab}`);
  if (activeTab === "overview") renderOverview();
  else renderRepositories();
}

function selectDay(date) {
  const day = snapshot.contributions.days.find((entry) => entry.date === date);
  if (!day) return;
  const detail = document.querySelector("#contribution-detail");
  detail.hidden = false;
  detail.innerHTML = `${esc(contributionLabel(day))}. ${link(`${profile.url}?tab=overview&from=${day.date}&to=${day.date}`, "View on GitHub ↗")}`;
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  const tab = button.dataset.tab;
  const count = tab === "repositories" ? snapshot.repositories.length : tab === "stars" ? snapshot.starred.length : null;
  button.innerHTML = `${icon(tab === "overview" ? "overview" : tab === "stars" ? "star" : "repo")}${tab === "overview" ? "Overview" : tab === "stars" ? "Stars" : "Repositories"}${count === null ? "" : `<span class="counter">${count}</span>`}`;
  button.addEventListener("click", () => {
    if (location.hash.slice(1) === tab) showTab(tab);
    else location.hash = tab;
  });
});
document.querySelectorAll(".external-tab").forEach((anchor, index) => anchor.insertAdjacentHTML("afterbegin", icon(index === 0 ? "project" : "package")));
document.querySelector(".profile-tabs").addEventListener("keydown", (event) => {
  const buttons = [...document.querySelectorAll("[data-tab]")];
  const current = buttons.indexOf(event.target);
  if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index].click(); buttons[index].focus();
});
view.addEventListener("input", (event) => {
  if (event.target.id === "repo-query") { filters[activeTab].query = event.target.value; renderRepositoryList(); }
});
view.addEventListener("change", (event) => {
  const key = { "repo-type": "type", "repo-language": "language", "repo-sort": "sort" }[event.target.id];
  if (key) { filters[activeTab][key] = event.target.value; renderRepositoryList(); }
});
view.addEventListener("click", (event) => {
  const day = event.target.closest(".contribution-day");
  if (day) selectDay(day.dataset.date);
});
view.addEventListener("keydown", (event) => {
  const button = event.target.closest(".contribution-day");
  if (!button || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const days = snapshot.contributions.days;
  const current = days.findIndex((day) => day.date === button.dataset.date);
  const weekday = new Date(`${button.dataset.date}T00:00:00Z`).getUTCDay();
  const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, Home: -weekday, End: 6 - weekday }[event.key];
  const index = Math.max(0, Math.min(days.length - 1, current + delta));
  const next = view.querySelector(`[data-date="${days[index].date}"]`);
  button.tabIndex = -1; next.tabIndex = 0; next.focus();
});
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
renderSidebar();
document.querySelector("#profile-footer").innerHTML = `<p>Personal GitHub profile · Public data from ${link(profile.url, "github.com/daoyi2026")}.</p><p>Last synced <time datetime="${esc(snapshot.syncedAt)}">${esc(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(snapshot.syncedAt)))} UTC</time> · Refreshed every 6 hours.</p>${snapshot.notices.map((notice) => `<p class="sync-warning">${esc(notice)}</p>`).join("")}`;
showTab(location.hash.slice(1));
document.documentElement.dataset.profileReady = "true";
