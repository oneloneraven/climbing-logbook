import { SAVE_ERROR, api, el, formatDate } from "./shared.js";

function inviteState(invite) {
  if (invite.usedAt)
    return `Used by ${invite.usedBy ?? "a removed account"}, ${formatDate(invite.usedAt, { withYear: true })}`;
  return `Unused, created ${formatDate(invite.createdAt, { withYear: true })}`;
}

function copyButton(invite, status) {
  const button = el("button", "btn ml-auto", "Copy link");
  button.type = "button";
  button.setAttribute("aria-label", `Copy link for invite ${invite.code}`);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      status.textContent = "Link copied.";
    } catch {
      status.textContent = `Couldn't copy it. The link is ${invite.url}`;
    }
  });
  return button;
}

function inviteItem(invite, status) {
  const item = el("li", "flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-b border-border");
  const details = el("div", "flex flex-col gap-0.5 min-w-0");
  details.append(el("code", "text-sm break-all", invite.code));
  if (invite.email) details.append(el("span", "text-sm text-muted break-all", `For ${invite.email}`));
  details.append(el("span", "text-xs text-muted", inviteState(invite)));
  item.append(details);
  if (!invite.usedAt) item.append(copyButton(invite, status));
  return item;
}

export async function startInvites() {
  const status = document.getElementById("invites-status");
  const list = document.getElementById("invites-list");
  const email = document.getElementById("invite-email");

  async function load() {
    const { invites } = await api("invites");
    list.replaceChildren(...invites.map(invite => inviteItem(invite, status)));
    return invites.length;
  }

  document.getElementById("invite-form").addEventListener("submit", async event => {
    event.preventDefault();
    const address = email.value.trim();
    try {
      const res = await fetch("/-/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address || null }),
      });
      if (res.status === 400) {
        status.textContent = "That isn't a valid email address.";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      email.value = "";
      await load();
      status.textContent = "Invite created. Copy its link to send it.";
    } catch {
      status.textContent = SAVE_ERROR;
    }
  });

  status.textContent = "Loading…";
  try {
    status.textContent = (await load()) ? "" : "No invites yet.";
  } catch {
    status.textContent = "Couldn't load these. Check your connection and reload.";
  }
}
