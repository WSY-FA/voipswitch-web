import { api, commandData } from "../core/api.js";
import { escapeHtml, formatDateTime } from "../core/format.js";

export function createUsersView({ t }) {
  const state = {
    users: [],
    domains: []
  };

  const els = {
    add: document.getElementById("openUserCreateButton"),
    body: document.getElementById("userTableBody"),
    empty: document.getElementById("userEmptyState"),
    dialog: document.getElementById("userDialog"),
    form: document.getElementById("userForm"),
    title: document.getElementById("userDialogTitle"),
    id: document.getElementById("userIdInput"),
    username: document.getElementById("userUsernameInput"),
    password: document.getElementById("userPasswordInput"),
    domains: document.getElementById("userDomainGrantList"),
    enabled: document.getElementById("userEnabledInput"),
    message: document.getElementById("userFormMessage"),
    close: document.getElementById("closeUserDialogButton"),
    cancel: document.getElementById("cancelUserDialogButton")
  };

  els.add.addEventListener("click", () => openUser());
  els.form.addEventListener("submit", saveUser);
  els.close.addEventListener("click", closeUser);
  els.cancel.addEventListener("click", closeUser);
  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) closeUser();
  });

  async function activate(view) {
    if (view === "users") await loadUsers();
  }

  async function refresh(view) {
    if (view === "users") await loadUsers();
  }

  function setDomains(domains) {
    state.domains = [...domains];
    renderDomainGrants([]);
  }

  async function loadUsers() {
    const result = await api("/api/users");
    state.users = commandData(result).users || [];
    renderUsers();
  }

  function renderUsers() {
    els.empty.hidden = state.users.length > 0;
    els.body.innerHTML = state.users.map(user => {
      const protectedAdmin = user.username === "admin" && user.role === "system_admin";
      const domains = user.role === "system_admin"
        ? `<span class="chip enabled">${escapeHtml(t("users.allDomains"))}</span>`
        : (user.domain_ids || []).map(domainId => {
            const domain = state.domains.find(item => item.domain_id === domainId);
            return `<span class="chip">${escapeHtml(domain?.name || domainId)}</span>`;
          }).join("");
      return `
        <tr>
          <td>
            <strong>${escapeHtml(user.username)}</strong>
            ${protectedAdmin ? `<div class="utility-label">${escapeHtml(t("users.protected"))}</div>` : ""}
          </td>
          <td>${escapeHtml(t(`users.roles.${user.role}`))}</td>
          <td><div class="domain-chip-list">${domains || "-"}</div></td>
          <td><span class="status-pill ${user.enabled ? "ok" : ""}">${escapeHtml(t(user.enabled ? "state.enabled" : "state.disabled"))}</span></td>
          <td class="mono-cell">${escapeHtml(formatDateTime(user.updated_at))}</td>
          <td class="actions-column">
            <div class="row-actions">
              <button class="icon-button" type="button" data-user-edit="${Number(user.user_id)}" title="${escapeHtml(t("actions.edit"))}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              ${protectedAdmin ? "" : `
                <button class="icon-button icon-button--danger" type="button" data-user-delete="${Number(user.user_id)}" title="${escapeHtml(t("actions.delete"))}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
    els.body.querySelectorAll("[data-user-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const user = state.users.find(item => Number(item.user_id) === Number(button.dataset.userEdit));
        if (user) openUser(user);
      });
    });
    els.body.querySelectorAll("[data-user-delete]").forEach(button => {
      button.addEventListener("click", () => deleteUser(Number(button.dataset.userDelete)));
    });
  }

  function renderDomainGrants(selectedIds) {
    const selected = new Set(selectedIds);
    els.domains.innerHTML = state.domains.length > 0
      ? state.domains.map(domain => `
          <label class="domain-grant-option">
            <input type="checkbox" value="${escapeHtml(domain.domain_id)}" ${selected.has(domain.domain_id) ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(domain.name || domain.domain_id)}</strong>
              <small>${escapeHtml(domain.realm || domain.domain_id)}</small>
            </span>
          </label>
        `).join("")
      : `<div class="empty-state empty-state--plain">${escapeHtml(t("users.noDomains"))}</div>`;
  }

  function openUser(user = null) {
    const protectedAdmin = user?.username === "admin" && user?.role === "system_admin";
    els.form.reset();
    els.id.value = user?.user_id || "";
    els.username.value = user?.username || "";
    els.username.disabled = protectedAdmin;
    els.password.required = !user;
    els.password.value = "";
    els.enabled.checked = user?.enabled !== false;
    els.enabled.disabled = protectedAdmin;
    renderDomainGrants(user?.domain_ids || []);
    els.domains.closest("fieldset").hidden = user?.role === "system_admin";
    els.title.textContent = user ? t("users.editTitle") : t("users.createTitle");
    setMessage("");
    if (!els.dialog.open) els.dialog.showModal();
  }

  function closeUser() {
    els.dialog.close();
    els.form.reset();
    els.id.value = "";
    setMessage("");
  }

  function selectedDomains() {
    return [...els.domains.querySelectorAll("input:checked")].map(input => input.value);
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!els.form.reportValidity()) return;
    const id = els.id.value;
    const current = state.users.find(user => String(user.user_id) === id);
    const domainIds = current?.role === "system_admin" ? [] : selectedDomains();
    if (current?.role !== "system_admin" && els.enabled.checked && domainIds.length === 0) {
      setMessage(t("users.domainRequired"), "error");
      return;
    }
    const payload = {
      username: els.username.value.trim(),
      password: els.password.value,
      enabled: els.enabled.checked,
      domain_ids: domainIds
    };
    try {
      await api(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      closeUser();
      await loadUsers();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function deleteUser(userId) {
    const user = state.users.find(item => Number(item.user_id) === userId);
    if (!window.confirm(t("users.deleteConfirm", { name: user?.username || `#${userId}` }))) return;
    await api(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    await loadUsers();
  }

  function setMessage(text, kind = "") {
    els.message.textContent = text;
    els.message.className = `form-message ${kind}`;
  }

  return { activate, refresh, setDomains };
}
