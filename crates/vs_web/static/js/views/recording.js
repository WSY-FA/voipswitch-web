import { api, objectData } from "../core/api.js";
import { escapeHtml } from "../core/format.js";

export function createRecordingView({ t }) {
  const state = {
    activeView: "",
    domains: [],
    policies: [],
    extensions: [],
    peerTrunks: [],
    regTrunks: [],
    forcedDomainId: null
  };

  const els = {
    domain: document.getElementById("recordingDomainFilter"),
    add: document.getElementById("openRecordingPolicyButton"),
    body: document.getElementById("recordingPolicyTableBody"),
    empty: document.getElementById("recordingPolicyEmptyState"),
    dialog: document.getElementById("recordingPolicyDialog"),
    form: document.getElementById("recordingPolicyForm"),
    id: document.getElementById("recordingPolicyIdInput"),
    name: document.getElementById("recordingPolicyNameInput"),
    targetPicker: document.getElementById("recordingPolicyTargetPicker"),
    direction: document.getElementById("recordingPolicyDirectionInput"),
    priority: document.getElementById("recordingPolicyPriorityInput"),
    enabled: document.getElementById("recordingPolicyEnabledInput"),
    message: document.getElementById("recordingPolicyMessage"),
    close: document.getElementById("closeRecordingPolicyButton"),
    cancel: document.getElementById("cancelRecordingPolicyButton")
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
    const action = event.target.closest("[data-transfer-action]")?.dataset.transferAction;
    if (!action) return;
    const source = action === "add" ? "available" : "selected";
    const refs = [...els.targetPicker.querySelectorAll(`input[data-transfer-side="${source}"]:checked`)]
      .map(input => input.value);
    transferTargets(refs, action);
  });
  els.targetPicker.addEventListener("dblclick", event => {
    const option = event.target.closest("[data-transfer-ref]");
    if (!option) return;
    transferTargets(
      [option.dataset.transferRef],
      option.dataset.transferSide === "available" ? "add" : "remove"
    );
  });

  async function activate(view) {
    state.activeView = view;
    if (view !== "recording") return;
    await ensureDomains();
    await loadSelectedDomain();
  }

  async function refresh(view) {
    if (view === "recording") await loadSelectedDomain();
  }

  async function ensureDomains() {
    const result = await api("/api/domains?page=1&page_size=500");
    state.domains = objectData(result).domains || [];
    const current = els.domain.value;
    els.domain.innerHTML = state.domains
      .map(domain => `<option value="${escapeHtml(domain.domain_id)}">${escapeHtml(domain.name || domain.domain_id)}</option>`)
      .join("");
    if (state.domains.some(domain => domain.domain_id === current)) {
      els.domain.value = current;
    }
    if (state.forcedDomainId) els.domain.value = state.forcedDomainId;
    els.domain.closest(".field-inline").hidden = Boolean(state.forcedDomainId);
    els.add.disabled = state.domains.length === 0;
  }

  async function loadSelectedDomain() {
    const domainId = state.forcedDomainId || els.domain.value;
    if (!domainId) {
      state.policies = [];
      state.extensions = [];
      state.peerTrunks = [];
      state.regTrunks = [];
      renderPolicies();
      renderTargetPicker();
      return;
    }
    const query = `domain=${encodeURIComponent(domainId)}&page=1&page_size=500`;
    const [policies, extensions, peerTrunks, regTrunks] = await Promise.all([
      api(`/api/recording-policies?${query}`),
      api(`/api/extensions?${query}`),
      api(`/api/trunks?${query}`),
      api(`/api/reg-trunks?${query}`)
    ]);
    state.policies = objectData(policies).recording_policies || [];
    state.extensions = objectData(extensions).extensions || [];
    state.peerTrunks = objectData(peerTrunks).peer_trunks || [];
    state.regTrunks = objectData(regTrunks).reg_trunks || [];
    renderPolicies();
    renderTargetPicker();
  }

  function renderPolicies() {
    els.empty.hidden = state.policies.length > 0;
    els.body.innerHTML = state.policies.map(policy => `
      <tr>
        <td>
          <strong>${escapeHtml(policy.name)}</strong>
          <div class="utility-label mono-cell">#${Number(policy.id)}</div>
        </td>
        <td><div class="recording-target-summary">${policyTargetLabels(policy).map(label => `<span>${escapeHtml(label)}</span>`).join("")}</div></td>
        <td>${escapeHtml(t(`recording.directions.${policy.direction}`))}</td>
        <td class="mono-cell">${Number(policy.priority)}</td>
        <td><span class="status-pill ${policy.enabled ? "ok" : ""}">${escapeHtml(t(policy.enabled ? "state.enabled" : "state.disabled"))}</span></td>
        <td>
          <div class="table-actions">
            <button class="icon-button" type="button" data-recording-edit="${Number(policy.id)}" title="${escapeHtml(t("actions.edit"))}">✎</button>
            <button class="icon-button icon-button--danger" type="button" data-recording-delete="${Number(policy.id)}" title="${escapeHtml(t("actions.delete"))}">×</button>
          </div>
        </td>
      </tr>
    `).join("");
    els.body.querySelectorAll("[data-recording-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const policy = state.policies.find(item => Number(item.id) === Number(button.dataset.recordingEdit));
        if (policy) openPolicy(policy);
      });
    });
    els.body.querySelectorAll("[data-recording-delete]").forEach(button => {
      button.addEventListener("click", () => deletePolicy(Number(button.dataset.recordingDelete)));
    });
  }

  function targetRows() {
    return [
      ...state.extensions.map(item => ({
        ref: `ext:${Number(item.id)}`,
        type: t("recording.targetTypes.extension"),
        label: `${item.number} · ${item.auth_user || item.number}`
      })),
      ...state.peerTrunks.map(item => ({
        ref: `peer:${Number(item.id)}`,
        type: t("recording.targetTypes.peerTrunk"),
        label: item.name || `#${Number(item.id)}`
      })),
      ...state.regTrunks.map(item => ({
        ref: `reg:${Number(item.id)}`,
        type: t("recording.targetTypes.regTrunk"),
        label: item.name || `#${Number(item.id)}`
      }))
    ];
  }

  function targetLabel(targetRef) {
    const target = targetRows().find(item => item.ref === targetRef);
    if (target) return `${target.type} · ${target.label}`;
    const [prefix, id] = String(targetRef).split(":");
    const title = {
      ext: t("recording.targetTypes.extension"),
      peer: t("recording.targetTypes.peerTrunk"),
      reg: t("recording.targetTypes.regTrunk")
    }[prefix] || prefix;
    return `${title} · #${id || "?"}`;
  }

  function policyTargetLabels(policy) {
    return Array.isArray(policy.target_refs)
      ? policy.target_refs.map(targetLabel)
      : [];
  }

  function selectedTargetRefs() {
    return [...els.targetPicker.querySelectorAll("[data-selected-ref]")]
      .map(option => option.dataset.selectedRef);
  }

  function renderTargetPicker(selectedRefs = selectedTargetRefs()) {
    const selected = new Set(selectedRefs);
    const rows = targetRows();
    const availableRows = rows.filter(row => !selected.has(row.ref));
    const selectedRows = selectedRefs.map(ref => (
      rows.find(row => row.ref === ref) || {
        ref,
        type: targetLabel(ref).split(" · ")[0],
        label: targetLabel(ref).split(" · ").slice(1).join(" · ")
      }
    ));
    els.targetPicker.innerHTML = `
      ${renderTransferPanel(
        "available",
        t("recording.availableTargets"),
        availableRows,
        t("recording.noAvailableTargets")
      )}
      <div class="recording-transfer__actions">
        <button
          class="recording-transfer__button"
          type="button"
          data-transfer-action="add"
          title="${escapeHtml(t("recording.addTargets"))}"
          aria-label="${escapeHtml(t("recording.addTargets"))}"
        >→</button>
        <button
          class="recording-transfer__button"
          type="button"
          data-transfer-action="remove"
          title="${escapeHtml(t("recording.removeTargets"))}"
          aria-label="${escapeHtml(t("recording.removeTargets"))}"
        >←</button>
      </div>
      ${renderTransferPanel(
        "selected",
        t("recording.selectedTargets"),
        selectedRows,
        t("recording.noSelectedTargets")
      )}
    `;
  }

  function renderTransferPanel(side, title, rows, emptyText) {
    return `
      <section class="recording-transfer__panel">
        <header class="recording-transfer__header">
          <strong>${escapeHtml(title)}</strong>
          <span>${rows.length}</span>
        </header>
        <div class="recording-transfer__list">
          ${rows.length > 0
            ? rows.map(row => `
              <label
                class="recording-transfer__option"
                data-transfer-ref="${escapeHtml(row.ref)}"
                data-transfer-side="${side}"
                ${side === "selected" ? `data-selected-ref="${escapeHtml(row.ref)}"` : ""}
              >
                <input
                  type="checkbox"
                  value="${escapeHtml(row.ref)}"
                  data-transfer-side="${side}"
                >
                <span class="recording-transfer__type">${escapeHtml(row.type)}</span>
                <span class="recording-transfer__label">${escapeHtml(row.label)}</span>
              </label>
            `).join("")
            : `<span class="recording-transfer__empty">${escapeHtml(emptyText)}</span>`}
        </div>
      </section>
    `;
  }

  function transferTargets(refs, action) {
    if (refs.length === 0) return;
    const current = selectedTargetRefs();
    const moving = new Set(refs);
    const next = action === "add"
      ? [...current, ...targetRows().map(row => row.ref).filter(ref => moving.has(ref) && !current.includes(ref))]
      : current.filter(ref => !moving.has(ref));
    renderTargetPicker(next);
  }

  function openPolicy(policy = null) {
    if (!(state.forcedDomainId || els.domain.value)) return;
    els.id.value = policy?.id || "";
    els.name.value = policy?.name || "";
    renderTargetPicker(policy?.target_refs || []);
    els.direction.value = policy?.direction || "both";
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
    if (targetRefs.length === 0) {
      setMessage(t("recording.targetRequired"), "error");
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
      enabled: els.enabled.checked
    };
    try {
      await api(
        id
          ? `/api/recording-policies/${encodeURIComponent(domainId)}/${encodeURIComponent(id)}`
          : "/api/recording-policies",
        {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );
      closePolicy();
      await loadSelectedDomain();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function deletePolicy(id) {
    const policy = state.policies.find(item => Number(item.id) === id);
    if (!window.confirm(t("recording.deleteConfirm", { name: policy?.name || `#${id}` }))) return;
    const domainId = state.forcedDomainId || els.domain.value;
    await api(`/api/recording-policies/${encodeURIComponent(domainId)}/${id}`, {
      method: "DELETE"
    });
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
