import { api, objectData } from "../core/api.js";
import { escapeHtml } from "../core/format.js";

export function createAiView({ t }) {
  const state = {
    activeView: "",
    forcedDomainId: null,
    domains: [],
    policies: [],
    extensions: [],
    peerTrunks: [],
    regTrunks: [],
    catalogAvailable: false,
    catalogVersion: null,
    profiles: []
  };

  const els = {
    domain: document.getElementById("aiDomainFilter"),
    add: document.getElementById("openAiPolicyButton"),
    catalog: document.getElementById("aiCatalogStatus"),
    body: document.getElementById("aiPolicyTableBody"),
    empty: document.getElementById("aiPolicyEmptyState"),
    dialog: document.getElementById("aiPolicyDialog"),
    form: document.getElementById("aiPolicyForm"),
    id: document.getElementById("aiPolicyIdInput"),
    name: document.getElementById("aiPolicyNameInput"),
    targetPicker: document.getElementById("aiPolicyTargetPicker"),
    profile: document.getElementById("aiPolicyProfileInput"),
    direction: document.getElementById("aiPolicyDirectionInput"),
    priority: document.getElementById("aiPolicyPriorityInput"),
    enabled: document.getElementById("aiPolicyEnabledInput"),
    message: document.getElementById("aiPolicyMessage"),
    close: document.getElementById("closeAiPolicyButton"),
    cancel: document.getElementById("cancelAiPolicyButton")
  };

  els.domain.addEventListener("change", loadSelectedDomain);
  els.add.addEventListener("click", () => openPolicy());
  els.form.addEventListener("submit", savePolicy);
  els.close.addEventListener("click", closePolicy);
  els.cancel.addEventListener("click", closePolicy);
  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) closePolicy();
  });
  els.targetPicker.addEventListener("click", event => {
    const action = event.target.closest("[data-ai-transfer-action]")?.dataset.aiTransferAction;
    if (!action) return;
    const source = action === "add" ? "available" : "selected";
    const refs = [...els.targetPicker.querySelectorAll(`input[data-ai-transfer-side="${source}"]:checked`)]
      .map(input => input.value);
    transferTargets(refs, action);
  });
  els.targetPicker.addEventListener("dblclick", event => {
    const option = event.target.closest("[data-ai-transfer-ref]");
    if (!option) return;
    transferTargets(
      [option.dataset.aiTransferRef],
      option.dataset.aiTransferSide === "available" ? "add" : "remove"
    );
  });

  async function activate(view) {
    state.activeView = view;
    if (view !== "ai") return;
    await Promise.all([ensureDomains(), loadProfiles()]);
    await loadSelectedDomain();
  }

  async function refresh(view) {
    if (view !== "ai") return;
    await loadProfiles();
    await loadSelectedDomain();
  }

  async function ensureDomains() {
    const result = await api("/api/domains?page=1&page_size=500");
    state.domains = objectData(result).domains || [];
    const current = els.domain.value;
    els.domain.innerHTML = state.domains
      .map(domain => `<option value="${escapeHtml(domain.domain_id)}">${escapeHtml(domain.name || domain.domain_id)}</option>`)
      .join("");
    if (state.domains.some(domain => domain.domain_id === current)) els.domain.value = current;
    if (state.forcedDomainId) els.domain.value = state.forcedDomainId;
    els.domain.closest(".field-inline").hidden = Boolean(state.forcedDomainId);
    updateAddState();
  }

  async function loadProfiles() {
    const result = await api("/api/ai-profiles");
    const data = objectData(result);
    state.catalogAvailable = data.available === true;
    state.catalogVersion = data.catalog_version ?? null;
    state.profiles = data.profiles || [];
    const executable = executableProfiles().length;
    els.catalog.textContent = state.catalogAvailable
      ? t("ai.catalogReady", { count: executable, version: state.catalogVersion || "-" })
      : t("ai.catalogUnavailable");
    els.catalog.classList.toggle("ok", state.catalogAvailable && executable > 0);
    updateAddState();
  }

  function updateAddState() {
    els.add.disabled = state.domains.length === 0 || executableProfiles().length === 0;
  }

  function executableProfiles() {
    return state.profiles.filter(item => item.enabled && item.executable);
  }

  async function loadSelectedDomain() {
    const domainId = state.forcedDomainId || els.domain.value;
    if (!domainId) {
      state.policies = [];
      state.extensions = [];
      state.peerTrunks = [];
      state.regTrunks = [];
      renderPolicies();
      renderTargetPicker([]);
      return;
    }
    const query = `domain=${encodeURIComponent(domainId)}&page=1&page_size=500`;
    const [policies, extensions, peerTrunks, regTrunks] = await Promise.all([
      api(`/api/ai-policies?${query}`),
      api(`/api/extensions?${query}`),
      api(`/api/trunks?${query}`),
      api(`/api/reg-trunks?${query}`)
    ]);
    state.policies = objectData(policies).ai_policies || [];
    state.extensions = objectData(extensions).extensions || [];
    state.peerTrunks = objectData(peerTrunks).peer_trunks || [];
    state.regTrunks = objectData(regTrunks).reg_trunks || [];
    renderPolicies();
    renderTargetPicker();
  }

  function renderPolicies() {
    els.empty.hidden = state.policies.length > 0;
    els.body.innerHTML = state.policies.map(policy => {
      const profile = profileProjection(policy.ai_profile_id);
      const executable = profile?.enabled && profile?.executable;
      return `
        <tr>
          <td><strong>${escapeHtml(policy.name)}</strong><div class="utility-label mono-cell">#${Number(policy.id)}</div></td>
          <td><div class="recording-target-summary">${policyTargetLabels(policy).map(label => `<span>${escapeHtml(label)}</span>`).join("")}</div></td>
          <td>${escapeHtml(t(`ai.directions.${policy.direction}`))}</td>
          <td><strong class="mono-cell">${escapeHtml(policy.ai_profile_id || "-")}</strong><div class="utility-label">${escapeHtml(profile ? `v${profile.profile.profile_version}` : t("ai.profileMissing"))}</div></td>
          <td class="mono-cell">${Number(policy.priority)}</td>
          <td><span class="status-pill ${policy.enabled && executable ? "ok" : ""}">${escapeHtml(policy.enabled ? (executable ? t("state.enabled") : t("ai.profileUnavailable")) : t("state.disabled"))}</span></td>
          <td><div class="table-actions">
            <button class="icon-button" type="button" data-ai-edit="${Number(policy.id)}" title="${escapeHtml(t("actions.edit"))}">✎</button>
            <button class="icon-button icon-button--danger" type="button" data-ai-delete="${Number(policy.id)}" title="${escapeHtml(t("actions.delete"))}">×</button>
          </div></td>
        </tr>
      `;
    }).join("");
    els.body.querySelectorAll("[data-ai-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const policy = state.policies.find(item => Number(item.id) === Number(button.dataset.aiEdit));
        if (policy) openPolicy(policy);
      });
    });
    els.body.querySelectorAll("[data-ai-delete]").forEach(button => {
      button.addEventListener("click", () => deletePolicy(Number(button.dataset.aiDelete)));
    });
  }

  function profileProjection(profileId) {
    return state.profiles.find(item => item.profile?.profile_id === profileId);
  }

  function targetRows() {
    return [
      ...state.extensions.map(item => ({ ref: `ext:${Number(item.id)}`, type: t("recording.targetTypes.extension"), label: `${item.number} · ${item.auth_user || item.number}` })),
      ...state.peerTrunks.map(item => ({ ref: `peer:${Number(item.id)}`, type: t("recording.targetTypes.peerTrunk"), label: item.name || `#${Number(item.id)}` })),
      ...state.regTrunks.map(item => ({ ref: `reg:${Number(item.id)}`, type: t("recording.targetTypes.regTrunk"), label: item.name || `#${Number(item.id)}` }))
    ];
  }

  function targetLabel(targetRef) {
    const target = targetRows().find(item => item.ref === targetRef);
    if (target) return `${target.type} · ${target.label}`;
    const [prefix, id] = String(targetRef).split(":");
    const title = { ext: t("recording.targetTypes.extension"), peer: t("recording.targetTypes.peerTrunk"), reg: t("recording.targetTypes.regTrunk") }[prefix] || prefix;
    return `${title} · #${id || "?"}`;
  }

  function policyTargetLabels(policy) {
    return Array.isArray(policy.target_refs) ? policy.target_refs.map(targetLabel) : [];
  }

  function selectedTargetRefs() {
    return [...els.targetPicker.querySelectorAll("[data-ai-selected-ref]")]
      .map(option => option.dataset.aiSelectedRef);
  }

  function renderTargetPicker(selectedRefs = selectedTargetRefs()) {
    const selected = new Set(selectedRefs);
    const rows = targetRows();
    const available = rows.filter(row => !selected.has(row.ref));
    const chosen = selectedRefs.map(ref => rows.find(row => row.ref === ref) || {
      ref,
      type: targetLabel(ref).split(" · ")[0],
      label: targetLabel(ref).split(" · ").slice(1).join(" · ")
    });
    els.targetPicker.innerHTML = `
      ${renderTransferPanel("available", t("ai.availableTargets"), available, t("ai.noAvailableTargets"))}
      <div class="recording-transfer__actions">
        <button class="recording-transfer__button" type="button" data-ai-transfer-action="add" title="${escapeHtml(t("ai.addTargets"))}">→</button>
        <button class="recording-transfer__button" type="button" data-ai-transfer-action="remove" title="${escapeHtml(t("ai.removeTargets"))}">←</button>
      </div>
      ${renderTransferPanel("selected", t("ai.selectedTargets"), chosen, t("ai.noSelectedTargets"))}
    `;
  }

  function renderTransferPanel(side, title, rows, emptyText) {
    return `<section class="recording-transfer__panel">
      <header class="recording-transfer__header"><strong>${escapeHtml(title)}</strong><span>${rows.length}</span></header>
      <div class="recording-transfer__list">${rows.length ? rows.map(row => `
        <label class="recording-transfer__option" data-ai-transfer-ref="${escapeHtml(row.ref)}" data-ai-transfer-side="${side}" ${side === "selected" ? `data-ai-selected-ref="${escapeHtml(row.ref)}"` : ""}>
          <input type="checkbox" value="${escapeHtml(row.ref)}" data-ai-transfer-side="${side}">
          <span class="recording-transfer__type">${escapeHtml(row.type)}</span>
          <span class="recording-transfer__label">${escapeHtml(row.label)}</span>
        </label>`).join("") : `<span class="recording-transfer__empty">${escapeHtml(emptyText)}</span>`}</div>
    </section>`;
  }

  function transferTargets(refs, action) {
    if (!refs.length) return;
    const current = selectedTargetRefs();
    const moving = new Set(refs);
    const next = action === "add"
      ? [...current, ...targetRows().map(row => row.ref).filter(ref => moving.has(ref) && !current.includes(ref))]
      : current.filter(ref => !moving.has(ref));
    renderTargetPicker(next);
  }

  function renderProfileOptions(selectedId = "") {
    const options = executableProfiles().map(item => ({
      id: item.profile.profile_id,
      label: `${item.profile.profile_id} · v${item.profile.profile_version}`,
      disabled: false
    }));
    if (selectedId && !options.some(option => option.id === selectedId)) {
      options.unshift({ id: selectedId, label: `${selectedId} · ${t("ai.profileUnavailable")}`, disabled: true });
    }
    els.profile.innerHTML = [
      `<option value="">${escapeHtml(t("ai.selectProfile"))}</option>`,
      ...options.map(option => `<option value="${escapeHtml(option.id)}" ${option.disabled ? "disabled" : ""}>${escapeHtml(option.label)}</option>`)
    ].join("");
    els.profile.value = selectedId;
  }

  function openPolicy(policy = null) {
    if (!(state.forcedDomainId || els.domain.value)) return;
    els.id.value = policy?.id || "";
    els.name.value = policy?.name || "";
    renderTargetPicker(policy?.target_refs || []);
    renderProfileOptions(policy?.ai_profile_id || executableProfiles()[0]?.profile.profile_id || "");
    els.direction.value = policy?.direction || "any";
    els.priority.value = Number(policy?.priority ?? 100);
    els.enabled.checked = policy?.enabled !== false;
    setMessage("");
    if (!els.dialog.open) els.dialog.showModal();
  }

  function closePolicy() {
    els.dialog.close();
    els.form.reset();
    els.id.value = "";
    renderTargetPicker([]);
    setMessage("");
  }

  async function savePolicy(event) {
    event.preventDefault();
    if (!els.form.reportValidity()) return;
    const targetRefs = selectedTargetRefs();
    if (!targetRefs.length) {
      setMessage(t("ai.targetRequired"), "error");
      return;
    }
    const domainId = state.forcedDomainId || els.domain.value;
    const id = els.id.value;
    const payload = {
      domain_id: domainId,
      name: els.name.value.trim(),
      target_refs: targetRefs,
      direction: els.direction.value,
      priority: Number(els.priority.value),
      ai_profile_id: els.profile.value,
      enabled: els.enabled.checked
    };
    try {
      await api(id ? `/api/ai-policies/${encodeURIComponent(domainId)}/${encodeURIComponent(id)}` : "/api/ai-policies", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      closePolicy();
      await loadSelectedDomain();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function deletePolicy(id) {
    const policy = state.policies.find(item => Number(item.id) === id);
    if (!window.confirm(t("ai.deleteConfirm", { name: policy?.name || `#${id}` }))) return;
    const domainId = state.forcedDomainId || els.domain.value;
    await api(`/api/ai-policies/${encodeURIComponent(domainId)}/${id}`, { method: "DELETE" });
    await loadSelectedDomain();
  }

  function setMessage(text, kind = "") {
    els.message.textContent = text;
    els.message.className = `form-message ${kind}`;
  }

  return {
    activate,
    refresh,
    setDomain(domainId) {
      state.forcedDomainId = domainId || null;
      if (state.forcedDomainId) els.domain.value = state.forcedDomainId;
      els.domain.closest(".field-inline").hidden = Boolean(state.forcedDomainId);
    }
  };
}
