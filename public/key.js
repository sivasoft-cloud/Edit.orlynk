/* Edit.or.lynk — Pro Key page logic.
 *
 * The page never decides that someone followed: it creates a session, hands
 * over a one-time code, opens the Instagram profile, and then only repeats
 * what the server says. A key appears solely once the server has confirmed
 * eligibility and issued one.
 */

const el = (id) => document.getElementById(id);

let session = null;
let pollTimer = null;

function setStatus(kind, title, text) {
  const icons = { idle: "i", pending: "", good: "✓", bad: "!", warn: "!" };
  const node = el("status");
  node.className = `status ${kind}`.trim();
  node.innerHTML = `
    <span class="icon" aria-hidden="true">${kind === "pending" ? '<span class="spinner"></span>' : icons[kind] || "i"}</span>
    <span><strong>${title}</strong>${text ? text : ""}</span>
  `;
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function getSession(id) {
  const response = await fetch(`/api/campaign/session/${encodeURIComponent(id)}`, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}

function instagramUrl(handle) {
  return handle ? `instagram://user?username=${encodeURIComponent(handle)}` : "https://instagram.com";
}

function instagramWebUrl(handle) {
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : "https://www.instagram.com/";
}

function openInstagram() {
  const handle = (session && session.handle) || "";
  const opened = window.open(instagramUrl(handle), "_blank");
  // If the app scheme did nothing, fall back to the web profile.
  window.setTimeout(() => {
    if (!opened || opened.closed) window.open(instagramWebUrl(handle), "_blank");
  }, 700);
}

async function start() {
  const name = el("name").value.trim();
  if (name.length < 2) {
    setStatus("bad", "Please enter your name.", "We use it to label your key.");
    el("name").focus();
    return;
  }

  const button = el("start");
  button.disabled = true;
  button.textContent = "Working…";

  try {
    session = await post("/api/campaign/session", { name });
    el("code").textContent = session.code;
    el("code-box").hidden = false;
    el("sent-actions").hidden = false;

    if (!session.verificationConfigured) {
      setStatus(
        "warn",
        "Instagram verification isn't active yet",
        "This account's Instagram permissions are still under review by Meta, so no key can be issued automatically. Follow the profile and message your code anyway — we'll hold it, and the key will be released as soon as verification is live. You can also ask for one directly."
      );
    } else {
      setStatus(
        "pending",
        "Open Instagram and send your code",
        `Follow the profile, then message <strong>${session.code}</strong> to it. Come back and press “I've sent the code”.`
      );
    }

    openInstagram();
  } catch (error) {
    setStatus("bad", "Couldn't start", error.message || "Try again in a moment.");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Continue to Instagram <span aria-hidden="true">→</span>';
  }
}

async function check() {
  if (!session) return;
  setStatus("pending", "Checking with Instagram…", "This only takes a moment.");
  el("check").disabled = true;

  const deadline = Date.now() + 8 * 60 * 1000;
  clearInterval(pollTimer);

  const poll = async () => {
    if (Date.now() > deadline) {
      clearInterval(pollTimer);
      el("check").disabled = false;
      setStatus("warn", "Still waiting for your message", "Send the code, then press the button again.");
      return;
    }
    try {
      const state = await getSession(session.sessionId);
      applyState(state);
      if (state.status === "issued" || state.status === "expired" || state.status === "not_configured") {
        clearInterval(pollTimer);
        el("check").disabled = false;
      }
    } catch (error) {
      clearInterval(pollTimer);
      el("check").disabled = false;
      setStatus("bad", "Couldn't reach the server", error.message || "Try again shortly.");
    }
  };

  await poll();
  pollTimer = setInterval(poll, 3000);
}

function applyState(state) {
  switch (state.status) {
    case "awaiting_dm":
      setStatus("pending", "Waiting for your message", `Send <strong>${el("code").textContent}</strong> as a direct message to the profile.`);
      break;
    case "dm_received":
      setStatus("pending", "Code received — checking the follow", "Instagram is confirming that this account follows the profile.");
      break;
    case "issued":
      if (state.key) showKey(state.key);
      setStatus("good", "Verified — your key is ready", "Copy it below and paste it into Edit.or.lynk.");
      break;
    case "not_following":
      setStatus("warn", "Not following yet", state.message || "Follow the profile, then message the code again.");
      break;
    case "not_configured":
      setStatus(
        "warn",
        "Instagram verification isn't active yet",
        "Meta hasn't approved the app's permissions, so we cannot confirm follows automatically. No key has been issued — follow the profile and message your code, and it will be released once verification is live."
      );
      break;
    case "check_failed":
      setStatus("warn", "Couldn't check the follow", "The Instagram lookup failed. Press check again in a moment.");
      break;
    case "expired":
      setStatus("bad", "That session expired", "Start again with a fresh code.");
      break;
    default:
      setStatus("idle", "Working on it", "");
  }
}

function showKey(key) {
  el("key").textContent = key;
  el("result").hidden = false;
  el("open-app").href = `editorlynk://activate?key=${encodeURIComponent(key)}`;
  el("result").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function copyKey() {
  const value = el("key").textContent.trim();
  const button = el("copy");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = "Copy Pro Key"), 1800);
  } catch {
    button.textContent = "Press ⌘C to copy";
    setTimeout(() => (button.textContent = "Copy Pro Key"), 2400);
  }
}

el("start").addEventListener("click", start);
el("check").addEventListener("click", check);
el("resend").addEventListener("click", openInstagram);
el("copy").addEventListener("click", copyKey);
el("name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") start();
});
