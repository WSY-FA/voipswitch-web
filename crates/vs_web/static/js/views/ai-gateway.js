import { api, objectData } from "../core/api.js";
import { escapeHtml } from "../core/format.js";

export function createAiGatewayView({ t }) {
  const els = {
    summary: document.getElementById("aiGatewaySummary"),
    body: document.getElementById("aiGatewayTableBody"),
    empty: document.getElementById("aiGatewayEmptyState"),
    refresh: document.getElementById("refreshAiGatewayButton")
  };
  let activeView = "";

  els.refresh.addEventListener("click", () => load().catch(error => renderError(error)));

  function stateLabel(projection) {
    if (projection.enabled && projection.executable) return t("aiGateway.ready");
    if (!projection.enabled) return t("aiGateway.disabled");
    return t("aiGateway.unavailable");
  }

  function render(data) {
    const profiles = data.profiles || [];
    els.summary.innerHTML = `
      <div class="ai-gateway-status">
        <span class="status-pill ${data.available ? "status-pill--ok" : "status-pill--warn"}">
          ${escapeHtml(data.available ? t("aiGateway.connected") : t("aiGateway.disconnected"))}
        </span>
        <span>${escapeHtml(t("aiGateway.catalogVersion", { version: data.catalog_version ?? "-" }))}</span>
        <span>${escapeHtml(t("aiGateway.profileCount", { count: profiles.length }))}</span>
        <span class="ai-gateway-readonly">${escapeHtml(t("aiGateway.readonly"))}</span>
      </div>`;
    els.empty.hidden = profiles.length > 0;
    els.body.innerHTML = profiles.map(item => {
      const profile = item.profile || {};
      const capture = `${Math.round(Number(profile.capture_complete_ratio || 0) * 100)}% / ${Math.round(Number(profile.capture_process_min_ratio || 0) * 100)}%`;
      return `<tr>
        <td class="mono-cell">${escapeHtml(profile.profile_id || "-")}</td>
        <td>v${escapeHtml(profile.profile_version || "-")}</td>
        <td><span class="mono-cell">ASR: ${escapeHtml(profile.asr_provider_id || "-")}</span><br><span class="mono-cell">LLM: ${escapeHtml(profile.llm_provider_id || "-")}</span></td>
        <td>${escapeHtml(capture)}<small class="table-note">${escapeHtml(t("aiGateway.captureHint"))}</small></td>
        <td><span class="status-pill ${item.enabled && item.executable ? "status-pill--ok" : ""}">${escapeHtml(stateLabel(item))}</span></td>
      </tr>`;
    }).join("");
  }

  function renderError(error) {
    els.summary.innerHTML = `<div class="empty-state empty-state--plain">${escapeHtml(error.message || t("aiGateway.unavailable"))}</div>`;
    els.body.innerHTML = "";
    els.empty.hidden = true;
  }

  async function load() {
    const result = await api("/api/ai-gateway");
    render(objectData(result));
  }

  return {
    async activate(view) {
      activeView = view;
      if (view === "aiGateway") await load();
    },
    async refresh(view) {
      if (view === "aiGateway") await load();
    }
  };
}
