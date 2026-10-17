const initialAlerts = [
  { id: "evt-1048", rule: "SSH_FAILED_PASSWORD", title: "Repeated failed SSH login", severity: "high", server: "edge-gateway-01", source: "/var/log/auth.log", line: "sshd[4812]: Failed password for deploy from 192.0.2.44 port 53318 ssh2", minutes: 8, acknowledged: false },
  { id: "evt-1047", rule: "WEB_SCAN", title: "Unusual path requested", severity: "high", server: "storefront-web-02", source: "/var/log/nginx/access.log", line: '198.51.100.37 - - "GET /wp-admin HTTP/1.1" 404 153', minutes: 34, acknowledged: false },
  { id: "evt-1046", rule: "SUDO_USED", title: "Privileged command observed", severity: "medium", server: "edge-gateway-01", source: "/var/log/auth.log", line: "sudo: deploy : TTY=pts/1 ; COMMAND=/usr/bin/systemctl status nginx", minutes: 76, acknowledged: true },
];

const rules = [
  { id: "SSH_FAILED_PASSWORD", name: "Failed SSH password", description: "Matches a line containing “Failed password”.", severity: "High", level: "high", icon: "↗", pattern: "Failed password" },
  { id: "WEB_SCAN", name: "Common web-scan path", description: "Matches “../” or “wp-admin” in a new line.", severity: "High", level: "high", icon: "⌁", pattern: "../  ·  wp-admin" },
  { id: "SUDO_USED", name: "Sudo command observed", description: "Matches a line containing “sudo”.", severity: "Medium", level: "medium", icon: "⌘", pattern: "sudo" },
];

const sampleAgents = [
  { id: "edge-gateway-01", platform: "Ubuntu 22.04", source: "/var/log/auth.log", status: "Example · not connected", seen: "8 min ago", symbol: "▤" },
  { id: "storefront-web-02", platform: "Debian 12", source: "/var/log/nginx/access.log", status: "Example · not connected", seen: "34 min ago", symbol: "▤" },
];

const titles = {
  overview: "Overview",
  alerts: "Alert inbox",
  agents: "Servers",
  detections: "Detection rules",
  settings: "Settings",
};

let alerts = load("dids-demo-alerts", initialAlerts);
let acknowledged = new Set(load("dids-demo-acknowledged", []));
let disabledRules = new Set(load("dids-demo-disabled-rules", []));
let severityFilter = "all";
let statusFilter = "all";
let currentPage = "overview";
let activeOs = "linux";
let toastTimer;

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem("dids-demo-alerts", JSON.stringify(alerts));
  localStorage.setItem("dids-demo-acknowledged", JSON.stringify([...acknowledged]));
  localStorage.setItem("dids-demo-disabled-rules", JSON.stringify([...disabledRules]));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function ago(minutes) {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

function symbolFor(alert) {
  return alert.severity === "high" ? "↗" : alert.severity === "medium" ? "⌘" : "⌁";
}

function renderRecentAlerts() {
  const container = document.querySelector("#recent-alerts");
  const sorted = [...alerts].sort((a, b) => a.minutes - b.minutes).slice(0, 3);
  container.innerHTML = sorted.map((alert) => `
    <div class="recent-row">
      <span class="recent-symbol ${escapeHtml(alert.severity)}">${symbolFor(alert)}</span>
      <span class="recent-copy"><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.server)} · sample</small></span>
      <span class="recent-when">${ago(alert.minutes)}</span>
    </div>`).join("");
  document.querySelector("#sample-count").textContent = String(alerts.length);
  document.querySelector("#nav-alert-count").textContent = String(alerts.filter((alert) => !acknowledged.has(alert.id)).length);
  document.querySelector("#filter-all-count").textContent = String(alerts.length);
}

function filteredAlerts() {
  const query = document.querySelector("#alert-search").value.trim().toLowerCase();
  return [...alerts]
    .sort((a, b) => a.minutes - b.minutes)
    .filter((alert) => severityFilter === "all" || alert.severity === severityFilter)
    .filter((alert) => statusFilter === "all" || (statusFilter === "open" ? !acknowledged.has(alert.id) : acknowledged.has(alert.id)))
    .filter((alert) => !query || `${alert.title} ${alert.rule} ${alert.server} ${alert.source} ${alert.line}`.toLowerCase().includes(query));
}

function renderInbox() {
  const rows = filteredAlerts();
  const container = document.querySelector("#alert-rows");
  document.querySelector("#empty-alerts").classList.toggle("hidden", rows.length > 0);
  document.querySelector(".inbox-table-head").classList.toggle("hidden", rows.length === 0);
  container.innerHTML = rows.map((alert) => {
    const isAcknowledged = acknowledged.has(alert.id);
    return `<article class="alert-row ${isAcknowledged ? "acknowledged" : ""}">
      <div class="alert-name-cell"><span class="recent-symbol ${escapeHtml(alert.severity)}">${symbolFor(alert)}</span><span><strong class="alert-title">${escapeHtml(alert.title)}</strong><small class="alert-subtitle">${escapeHtml(alert.rule)} · sample</small></span></div>
      <span class="server-cell">${escapeHtml(alert.server)}</span>
      <span class="severity-pill ${escapeHtml(alert.severity)}"><i class="severity-dot ${escapeHtml(alert.severity)}"></i>${alert.severity[0].toUpperCase() + alert.severity.slice(1)}</span>
      <span class="status-pill ${isAcknowledged ? "ack" : ""}">${isAcknowledged ? "Reviewed" : "Needs review"}</span>
      <span class="when-cell">${ago(alert.minutes)}</span>
      <button class="row-menu" type="button" data-alert-action="${escapeHtml(alert.id)}" aria-label="${isAcknowledged ? "Reopen" : "Mark reviewed"} alert">···</button>
    </article>`;
  }).join("");
  document.querySelector("#alert-summary").textContent = `Showing ${rows.length} of ${alerts.length} sample alerts`;
}

function renderRules() {
  document.querySelector("#rule-preview").innerHTML = rules.map((rule) => `
    <div class="rule-preview"><span class="rule-preview-icon">${rule.icon}</span><span class="rule-preview-copy"><strong>${escapeHtml(rule.name)}</strong><small>${escapeHtml(rule.description)}</small></span><span class="rule-state">${disabledRules.has(rule.id) ? "OFF" : "ON"}</span></div>`).join("");
  document.querySelector("#rule-list").innerHTML = rules.map((rule) => {
    const enabled = !disabledRules.has(rule.id);
    return `<article class="rule-card ${enabled ? "" : "disabled"}">
      <span class="rule-card-icon">${rule.icon}</span>
      <span class="rule-card-copy"><strong>${escapeHtml(rule.name)}</strong><p>${escapeHtml(rule.description)} <code>${escapeHtml(rule.pattern)}</code></p></span>
      <span class="rule-severity ${rule.level}">${rule.severity}</span>
      <button class="switch ${enabled ? "on" : ""}" type="button" role="switch" aria-checked="${enabled}" aria-label="${enabled ? "Disable" : "Enable"} ${escapeHtml(rule.name)}" data-rule="${escapeHtml(rule.id)}"></button>
    </article>`;
  }).join("");
}

function renderAgents() {
  document.querySelector("#agent-rows").innerHTML = sampleAgents.map((agent) => `
    <article class="agent-row">
      <div class="agent-name"><span class="agent-icon">${agent.symbol}</span><span><strong>${escapeHtml(agent.id)}</strong><small>Example record</small></span></div>
      <span class="agent-platform">${escapeHtml(agent.platform)}</span>
      <code class="agent-log">${escapeHtml(agent.source)}</code>
      <span class="agent-status"><i></i>${escapeHtml(agent.status)}</span>
      <span class="when-cell">${escapeHtml(agent.seen)}</span>
      <span></span>
    </article>`).join("");
}

function navigate(page) {
  if (!titles[page]) return;
  currentPage = page;
  document.querySelectorAll(".page-view").forEach((view) => view.classList.toggle("active", view.id === `page-${page}`));
  document.querySelectorAll("[data-page]").forEach((item) => {
    if (item.matches(".nav-item, .nav-settings")) item.classList.toggle("active", item.dataset.page === page);
  });
  document.title = `${titles[page]} — Linewatch`;
  history.replaceState(null, "", `#${page}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add("hidden"), 2600);
}

function showAgentModal() {
  document.querySelector("#agent-modal").classList.remove("hidden");
  document.querySelector(".modal-close").focus();
}

function closeAgentModal() {
  document.querySelector("#agent-modal").classList.add("hidden");
}

function setOperatingSystem(os) {
  activeOs = os;
  document.querySelectorAll(".os-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.os === os));
  document.querySelector("#setup-linux").classList.toggle("hidden", os !== "linux");
  document.querySelector("#setup-macos").classList.toggle("hidden", os !== "macos");
  document.querySelector("#copy-feedback").textContent = "Setup is manual in this prototype.";
}

function generateSampleAlert() {
  const now = new Date();
  const alert = {
    id: `demo-${now.getTime()}`,
    rule: "SSH_FAILED_PASSWORD",
    title: "Failed SSH login (demo)",
    severity: "high",
    server: "local-demo-agent",
    source: "~/dids-demo.log",
    line: "Failed password for demo from 192.0.2.10",
    minutes: 0,
    acknowledged: false,
  };
  alerts.unshift(alert);
  acknowledged.delete(alert.id);
  saveState();
  renderRecentAlerts();
  renderInbox();
  toast("Added a sample alert in this browser. Nothing was sent to the server.");
}

async function refreshMetrics() {
  const status = document.querySelector("#server-state");
  const indicator = document.querySelector("#connection-indicator");
  const title = document.querySelector("#connection-title");
  const description = document.querySelector("#connection-description");
  document.querySelector("#last-checked").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  try {
    const response = await fetch("/api/metrics", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.connected) throw new Error(result.error || "Local server is unavailable");
    const counters = result.counters;
    const connections = counters.dids_server_connections_total ?? 0;
    const received = counters.dids_server_alerts_received_total ?? 0;
    document.querySelector("#connection-count").textContent = connections.toLocaleString();
    document.querySelector("#alert-count").textContent = received.toLocaleString();
    status.className = "metric-status";
    status.innerHTML = "<i></i> Local server is up";
    document.querySelector("#alert-counter-note").textContent = `${(counters.dids_server_alerts_malformed_total ?? 0).toLocaleString()} malformed`;
    indicator.className = "connection-indicator connected";
    indicator.innerHTML = "<i></i><span>CONNECTED</span>";
    document.querySelector("#frame-link-status").textContent = "ONLINE";
    title.textContent = "Local sensor is online";
    description.textContent = "Live metrics are coming from this machine.";
  } catch {
    document.querySelector("#connection-count").textContent = "—";
    document.querySelector("#alert-count").textContent = "—";
    status.className = "metric-status offline";
    status.innerHTML = "<i></i> Not reachable";
    document.querySelector("#alert-counter-note").textContent = "Start the local DIDS server";
    indicator.className = "connection-indicator offline";
    indicator.innerHTML = "<i></i><span>OFFLINE</span>";
    document.querySelector("#frame-link-status").textContent = "OFFLINE";
    title.textContent = "Local server not found";
    description.textContent = "The preview still works. Start the C++ server to see live counters.";
  }
}

document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
document.querySelectorAll("[data-page-link]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  navigate(link.dataset.pageLink);
}));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
document.querySelectorAll("#add-agent-top, #add-agent-button, #agent-callout-action").forEach((button) => button.addEventListener("click", showAgentModal));
document.querySelector(".modal-close").addEventListener("click", closeAgentModal);
document.querySelector(".modal-done").addEventListener("click", closeAgentModal);
document.querySelector("#agent-modal").addEventListener("click", (event) => {
  if (event.target.id === "agent-modal") closeAgentModal();
});
document.querySelectorAll(".os-tab").forEach((tab) => tab.addEventListener("click", () => setOperatingSystem(tab.dataset.os)));
document.querySelectorAll(".copy-command").forEach((button) => button.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    document.querySelector("#copy-feedback").textContent = "Copied to clipboard.";
  } catch {
    document.querySelector("#copy-feedback").textContent = button.dataset.copy;
  }
}));
document.querySelector(".notice-dismiss").addEventListener("click", () => document.querySelector(".demo-notice").classList.add("hidden"));
document.querySelector("#refresh-button").addEventListener("click", () => {
  void refreshMetrics();
  toast("Checked the local sensor.");
});
document.querySelector("#make-alert-button").addEventListener("click", generateSampleAlert);
document.querySelector("#alert-search").addEventListener("input", renderInbox);
document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
  severityFilter = button.dataset.filter;
  document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
  renderInbox();
}));
document.querySelector("#status-filter").addEventListener("click", (event) => {
  statusFilter = statusFilter === "all" ? "open" : statusFilter === "open" ? "reviewed" : "all";
  event.currentTarget.innerHTML = `${statusFilter === "all" ? "All statuses" : statusFilter === "open" ? "Needs review" : "Reviewed"} <span>⌄</span>`;
  renderInbox();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  severityFilter = "all";
  statusFilter = "all";
  document.querySelector("#alert-search").value = "";
  document.querySelector("#status-filter").innerHTML = "All statuses <span>⌄</span>";
  document.querySelectorAll(".filter-button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  renderInbox();
});
document.querySelector("#alert-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-alert-action]");
  if (!button) return;
  const id = button.dataset.alertAction;
  if (acknowledged.has(id)) acknowledged.delete(id);
  else acknowledged.add(id);
  saveState();
  renderRecentAlerts();
  renderInbox();
});
document.querySelector("#rule-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-rule]");
  if (!button) return;
  const id = button.dataset.rule;
  if (disabledRules.has(id)) disabledRules.delete(id);
  else disabledRules.add(id);
  saveState();
  renderRules();
  toast("Saved in this browser preview. The agent configuration is unchanged.");
});
document.querySelector("#reset-demo").addEventListener("click", () => {
  alerts = structuredClone(initialAlerts);
  acknowledged = new Set(initialAlerts.filter((alert) => alert.acknowledged).map((alert) => alert.id));
  disabledRules = new Set();
  saveState();
  renderRecentAlerts();
  renderInbox();
  renderRules();
  toast("Demo preview reset.");
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    navigate("alerts");
    document.querySelector("#alert-search").focus();
  }
  if (event.key === "Escape") closeAgentModal();
});

renderRecentAlerts();
renderInbox();
renderRules();
renderAgents();
refreshMetrics();
setInterval(refreshMetrics, 5000);
const initialPage = window.location.hash.slice(1);
if (titles[initialPage]) navigate(initialPage);
