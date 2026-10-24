/* Edit.or.lynk — admin console.
 *
 * The token is entered here and kept in sessionStorage for this tab only; it is
 * sent as X-Admin-Token on every call. Nothing private ships with the page.
 */

const el = (id) => document.getElementById(id);
let token = sessionStorage.getItem("adminToken") || "";

const headers = () => ({
  "Content-Type": "application/json",
  "X-Admin-Token": token
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: headers(),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("unauthorised");
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(ms) {
  return new Date(ms).toLocaleString();
}

async function unlock() {
  token = el("token").value.trim();
  if (!token) return;
  try {
    await api("/api/admin/overview");
    sessionStorage.setItem("adminToken", token);
    el("gate-status").hidden = true;
    el("gate").hidden = true;
    el("console").hidden = false;
    await refresh();
  } catch {
    token = "";
    sessionStorage.removeItem("adminToken");
    el("gate-status").hidden = false;
  }
}

async function refresh() {
  const [overview, keys, audit] = await Promise.all([
    api("/api/admin/overview"),
    api(`/api/admin/keys?q=${encodeURIComponent(el("search").value)}&status=${encodeURIComponent(el("filter").value)}`),
    api("/api/admin/audit")
  ]);

  el("stat-active").textContent = overview.active;
  el("stat-total").textContent = overview.total;
  el("stat-revoked").textContent = overview.revoked;
  el("stat-issued").textContent = overview.issued;

  const rows = (keys.keys || []).map((row) => `
    <tr>
      <td class="key">${escapeHtml(row.key_plain)}</td>
      <td><span class="tag ${row.status}">${row.status}</span></td>
      <td>${formatDate(row.created_at)}</td>
      <td>${formatDate(row.expires_at)}</td>
      <td>${row.redemptions}/${row.redemption_limit}</td>
      <td>${escapeHtml(row.note || "—")}</td>
      <td>
        <div class="row-actions">
          <button class="mini" data-copy="${escapeHtml(row.key_plain)}">Copy</button>
          ${row.status === "active" ? `<button class="mini danger" data-revoke="${row.id}">Revoke</button>` : ""}
        </div>
      </td>
    </tr>
  `);
  el("rows").innerHTML = rows.length
    ? rows.join("")
    : '<tr><td colspan="7">No keys match.</td></tr>';

  el("audit").innerHTML = (audit.entries || []).length
    ? audit.entries.map((entry) => `
        <li>
          <time>${formatTime(entry.at)}</time>
          <span><strong>${escapeHtml(entry.action)}</strong> ${escapeHtml(entry.subject || "")} ${escapeHtml(entry.detail || "")}</span>
        </li>
      `).join("")
    : "<li><span>No entries yet.</span></li>";
}

async function generate() {
  const button = el("generate");
  button.disabled = true;
  try {
    const body = {
      count: Number(el("gen-count").value) || 1,
      days: Number(el("gen-days").value) || 365,
      note: el("gen-note").value.trim() || "manual"
    };
    const result = await api("/api/admin/keys", { method: "POST", body });
    el("gen-keys").innerHTML = (result.keys || [])
      .map((k) => `<br><code>${escapeHtml(k.key)}</code>`)
      .join("");
    el("gen-result").hidden = false;
    await refresh();
  } catch (error) {
    alert(error.message || "Couldn't generate keys.");
  } finally {
    button.disabled = false;
  }
}

async function revoke(id) {
  if (!window.confirm("Revoke this key? The Pro access it granted stops at the next check.")) return;
  try {
    await api(`/api/admin/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    await refresh();
  } catch (error) {
    alert(error.message || "Couldn't revoke that key.");
  }
}

function escapeHtml(text) {
  // Numeric references, so untrusted text never becomes markup.
  const codes = { "&": 38, "<": 60, ">": 62, '"': 34, "'": 39 };
  return String(text).replace(/[&<>"']/g, (ch) => `&#${codes[ch]};`);
}

el("unlock").addEventListener("click", unlock);
el("token").addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlock();
});
el("generate").addEventListener("click", generate);
el("search").addEventListener("input", () => refresh().catch(() => {}));
el("filter").addEventListener("change", () => refresh().catch(() => {}));

document.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    const value = copy.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(value);
      copy.textContent = "Copied ✓";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    } catch {
      window.prompt("Copy this key:", value);
    }
    return;
  }
  const revokeButton = event.target.closest("[data-revoke]");
  if (revokeButton) await revoke(revokeButton.getAttribute("data-revoke"));
});

if (token) {
  api("/api/admin/overview")
    .then(() => {
      el("gate").hidden = true;
      el("console").hidden = false;
      refresh().catch(() => {});
    })
    .catch(() => {
      sessionStorage.removeItem("adminToken");
      token = "";
    });
}
