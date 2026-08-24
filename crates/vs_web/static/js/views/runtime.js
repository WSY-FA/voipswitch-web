import { api, objectData, tableRows } from "../core/api.js";
import { escapeHtml, formatBytes, formatDateTime, formatDuration } from "../core/format.js";

export function traceLeg(message) {
  const sessionId = String(message.session_id || "").toLowerCase();
  if (sessionId.includes("-callee") || sessionId.includes("callee")) return "callee";
  if (sessionId.includes("-caller") || sessionId.includes("caller")) return "caller";
  return "unknown";
}

export function tracePeerAddress(messages, leg) {
  for (const message of messages) {
    if (traceLeg(message) !== leg) continue;
    const address = message.direction === "rx"
      ? message.source_addr
      : message.destination_addr;
    if (address) return address;
  }
  return "";
}

function traceLanePosition(leg) {
  if (leg === "caller") return 16.6667;
  if (leg === "callee") return 83.3333;
  return 50;
}

export function traceArrow(message) {
  const leg = traceLeg(message) === "unknown" ? "caller" : traceLeg(message);
  const endpoint = traceLanePosition(leg);
  const pbx = traceLanePosition("pbx");
  const source = message.direction === "rx" ? endpoint : pbx;
  const destination = message.direction === "rx" ? pbx : endpoint;
  return {
    left: Number(Math.min(source, destination).toFixed(4)),
    width: Number(Math.abs(destination - source).toFixed(4)),
    reverse: destination < source,
    leg
  };
}

export function createRuntimeViews({ t }) {
  const state = {
    activeView: null,
    calls: [],
    sessions: [],
    domains: [],
    selectedCallId: null,
    cdrRecords: [],
    cdrPage: 1,
    cdrPageSize: 50,
    cdrTotal: 0,
    forcedDomainId: null,
    pollTimer: null
  };
  const els = {
    callsDomain: document.getElementById("callsDomainFilter"),
    callsUpdated: document.getElementById("callsUpdatedAt"),
    callsBody: document.getElementById("callsTableBody"),
    callsEmpty: document.getElementById("callsEmptyState"),
    callsTotal: document.getElementById("callsTotalCount"),
    callsRinging: document.getElementById("callsRingingCount"),
    callsAnswered: document.getElementById("callsAnsweredCount"),
    callsTerminating: document.getElementById("callsTerminatingCount"),
    sessionDetail: document.getElementById("sessionDetail"),
    cdrDomain: document.getElementById("cdrDomainFilter"),
    cdrPageSize: document.getElementById("cdrPageSize"),
    cdrBody: document.getElementById("cdrTableBody"),
    cdrEmpty: document.getElementById("cdrEmptyState"),
    cdrPagination: document.getElementById("cdrPagination"),
    traceDialog: document.getElementById("callTraceDialog"),
    traceTitle: document.getElementById("callTraceTitle"),
    traceCount: document.getElementById("callTraceCount"),
    traceIncomplete: document.getElementById("callTraceIncomplete"),
    traceCallerLane: document.getElementById("callTraceCallerLane"),
    tracePbxLane: document.getElementById("callTracePbxLane"),
    traceCalleeLane: document.getElementById("callTraceCalleeLane"),
    traceRows: document.getElementById("callTraceRows"),
    traceEmpty: document.getElementById("callTraceEmpty"),
    tracePacket: document.getElementById("callTracePacket"),
    tracePacketMeta: document.getElementById("callTracePacketMeta"),
    traceClose: document.getElementById("closeCallTraceButton"),
    aiResultDialog: document.getElementById("callAiResultDialog"),
    aiResultTitle: document.getElementById("callAiResultTitle"),
    aiResultVersion: document.getElementById("callAiResultVersion"),
    aiResultBody: document.getElementById("callAiResultBody"),
    aiResultClose: document.getElementById("closeCallAiResultButton")
  };

  function domainQuery(select) {
    const domainId = state.forcedDomainId || select.value;
    return domainId ? `domain=${encodeURIComponent(domainId)}` : "";
  }

  function stateLabel(value) {
    const label = t(`callState.${value}`);
    return label.startsWith("callState.") ? value : label;
  }

  function stateBadge(value) {
    return `<span class="call-state call-state--${escapeHtml(value)}">${escapeHtml(stateLabel(value))}</span>`;
  }

  function updateDomainOptions() {
    const domains = state.domains;
    for (const select of [els.callsDomain, els.cdrDomain]) {
      const current = select.value;
      select.innerHTML = [
        `<option value="">${escapeHtml(t("runtime.allDomains"))}</option>`,
        ...domains.map(domain => `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`)
      ].join("");
      select.value = state.forcedDomainId || (domains.includes(current) ? current : "");
      select.closest(".field-inline").hidden = Boolean(state.forcedDomainId);
    }
  }

  async function ensureDomains() {
    if (state.domains.length > 0) return;
    const result = await api("/api/domains?page=1&page_size=500");
    const data = objectData(result);
    state.domains = (data.domains || [])
      .map(domain => domain.domain_id)
      .filter(Boolean)
      .sort();
    updateDomainOptions();
  }

  function renderCalls() {
    const now = Date.now();
    els.callsTotal.textContent = String(state.calls.length);
    els.callsRinging.textContent = String(state.calls.filter(call =>
      ["dialing", "ringing", "early_media"].includes(call.state)
    ).length);
    els.callsAnswered.textContent = String(state.calls.filter(call => call.state === "answered").length);
    els.callsTerminating.textContent = String(state.calls.filter(call => call.state === "terminating").length);
    els.callsEmpty.hidden = state.calls.length > 0;
    els.callsBody.innerHTML = state.calls.map(call => `
      <tr class="${call.call_id === state.selectedCallId ? "is-selected" : ""}" data-call-id="${escapeHtml(call.call_id)}">
        <td>${stateBadge(call.state)}</td>
        <td class="mono-cell">${escapeHtml(call.caller_number || "-")}</td>
        <td class="direction-cell"><span aria-hidden="true">→</span></td>
        <td class="mono-cell">${escapeHtml(call.callee_number || "-")}</td>
        <td>${escapeHtml(call.domain_id || "-")}</td>
        <td>${formatDateTime(call.started_at_ms)}</td>
        <td class="mono-cell">${formatDuration(now - Number(call.started_at_ms || now))}</td>
        <td>${call.last_status || "-"}</td>
      </tr>
    `).join("");
    els.callsBody.querySelectorAll("[data-call-id]").forEach(row => {
      row.addEventListener("click", () => {
        state.selectedCallId = row.dataset.callId;
        renderCalls();
      });
    });
    if (state.selectedCallId && !state.calls.some(call => call.call_id === state.selectedCallId)) {
      state.selectedCallId = state.calls[0]?.call_id || null;
    }
    renderSessions();
  }

  function renderSessions() {
    const call = state.calls.find(item => item.call_id === state.selectedCallId);
    const sessions = state.sessions.filter(item => item.call_id === state.selectedCallId);
    if (!call) {
      els.sessionDetail.innerHTML = `<div class="empty-state empty-state--plain">${escapeHtml(t("runtime.selectCall"))}</div>`;
      return;
    }
    els.sessionDetail.innerHTML = `
      <div class="session-detail__header">
        <div>
          <div class="utility-label">${escapeHtml(t("runtime.callId"))}</div>
          <strong class="mono-cell">${escapeHtml(call.call_id)}</strong>
        </div>
        ${stateBadge(call.state)}
      </div>
      <div class="session-list">
        ${sessions.map(session => `
          <article class="session-row">
            <div class="session-row__direction">${escapeHtml(t(`direction.${session.direction}`))}</div>
            <div>
              <div class="session-row__number mono-cell">${escapeHtml(session.number || "-")}</div>
              <div class="session-row__peer">${escapeHtml(t("runtime.peer"))}: ${escapeHtml(session.peer_number || "-")}</div>
            </div>
            <div class="session-row__meta">
              <span>${escapeHtml(stateLabel(session.state))}</span>
              <span class="mono-cell">${escapeHtml(session.session_id)}</span>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  async function loadCalls() {
    const query = domainQuery(els.callsDomain);
    const suffix = query ? `?${query}` : "";
    const [callsResult, sessionsResult] = await Promise.all([
      api(`/api/calls${suffix}`),
      api(`/api/sessions${suffix}`)
    ]);
    state.calls = tableRows(callsResult);
    state.sessions = tableRows(sessionsResult);
    if (!state.selectedCallId) state.selectedCallId = state.calls[0]?.call_id || null;
    updateDomainOptions();
    els.callsUpdated.textContent = t("runtime.updatedAt", { time: formatDateTime(Date.now()) });
    renderCalls();
  }

  function renderCdr(records) {
    state.cdrRecords = records;
    els.cdrEmpty.hidden = records.length > 0;
    els.cdrBody.innerHTML = records.map(record => `
      <tr>
        <td>${formatDateTime(record.started_at_ms)}</td>
        <td class="mono-cell">${escapeHtml(record.caller_number || "-")}</td>
        <td class="direction-cell"><span aria-hidden="true">→</span></td>
        <td class="mono-cell">${escapeHtml(record.callee_number || "-")}</td>
        <td>${renderCdrDirection(record, "inbound")}</td>
        <td>${renderCdrDirection(record, "outbound")}</td>
        <td>${record.answered ? stateBadge("answered") : stateBadge("failed")}</td>
        <td class="mono-cell">${formatDuration(record.billable_ms)}</td>
        <td>${escapeHtml(record.hangup_cause || "-")}</td>
        <td>${escapeHtml(mediaForwardingLabel(record.media_forwarding_mode))}</td>
        <td class="media-cell">
          <span>↑ ${Number(record.caller_to_callee_packets || 0)} / ${formatBytes(record.caller_to_callee_bytes)}</span>
          <span>↓ ${Number(record.callee_to_caller_packets || 0)} / ${formatBytes(record.callee_to_caller_bytes)}</span>
        </td>
        <td>
          ${record.trace_available
            ? `<button class="trace-button" type="button" data-trace-call-id="${escapeHtml(record.call_id)}">${escapeHtml(t("trace.view"))}${record.trace_incomplete ? " !" : ""}</button>`
            : `<span class="trace-unavailable">${escapeHtml(t("trace.unavailable"))}</span>`}
        </td>
        <td>
          ${record.recording_available
            ? `<div class="recording-cell">
                <audio controls preload="none" src="/api/cdr/${encodeURIComponent(record.call_id)}/recording/content"></audio>
                <a class="icon-button" href="/api/cdr/${encodeURIComponent(record.call_id)}/recording/download" title="${escapeHtml(t("recording.download"))}" aria-label="${escapeHtml(t("recording.download"))}">↓</a>
              </div>`
            : `<span class="trace-unavailable">${escapeHtml(recordingStateLabel(record.recording_status))}</span>`}
        </td>
        <td>
          <button class="trace-button" type="button" data-ai-result-call-id="${escapeHtml(record.call_id)}">${escapeHtml(t("aiResult.view"))}</button>
        </td>
      </tr>
    `).join("");
    els.cdrBody.querySelectorAll("[data-trace-call-id]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        openCallTrace(button.dataset.traceCallId).catch(console.error);
      });
    });
    els.cdrBody.querySelectorAll("[data-ai-result-call-id]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        openAiResults(button.dataset.aiResultCallId).catch(console.error);
      });
    });
    renderCdrPagination();
  }

  function aiResultArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function aiParticipantLabel(participantId) {
    const key = {
      caller: "aiResult.participant.caller",
      callee: "aiResult.participant.callee"
    }[String(participantId || "").toLowerCase()];
    const label = key ? t(key) : "";
    return label || participantId || t("aiResult.participant");
  }

  function localizeAiText(value) {
    return String(value ?? "")
      .replace(/\bcall(?:er)?\b/gi, "主叫")
      .replace(/\bcallee\b/gi, "被叫");
  }

  function renderAiList(items) {
    const values = aiResultArray(items);
    if (!values.length) return `<span class="trace-unavailable">${escapeHtml(t("aiResult.noItems"))}</span>`;
    return `<ul class="ai-result-list">${values.map(item => `<li>${escapeHtml(localizeAiText(typeof item === "string" ? item : JSON.stringify(item)))}</li>`).join("")}</ul>`;
  }

  function renderAiResult(record) {
    if (!record) {
      els.aiResultBody.innerHTML = `<div class="empty-state empty-state--plain">${escapeHtml(t("aiResult.empty"))}</div>`;
      return;
    }
    const result = record.result && typeof record.result === "object" ? record.result : {};
    const transcript = aiResultArray(record.transcript);
    const qualityKey = `aiResult.quality.${record.capture_quality}`;
    const qualityLabel = t(qualityKey);
    els.aiResultBody.innerHTML = `
      <section class="ai-result-summary">
        <div class="ai-result-meta">
          <div><span>${escapeHtml(t("aiResult.captureQuality"))}</span><strong>${escapeHtml(qualityLabel.startsWith("aiResult.quality.") ? record.capture_quality || "-" : qualityLabel)}</strong></div>
          <div><span>${escapeHtml(t("aiResult.profile"))}</span><strong class="mono-cell">${escapeHtml(record.profile_id || "-")} · v${escapeHtml(record.profile_version ?? "-")}</strong></div>
          <div><span>${escapeHtml(t("aiResult.receivedAt"))}</span><strong>${escapeHtml(formatDateTime(record.received_at_ms))}</strong></div>
        </div>
        <article><h3>${escapeHtml(t("aiResult.summary"))}</h3><p>${escapeHtml(localizeAiText(result.summary || t("aiResult.noItems")))}</p></article>
        <div class="ai-result-summary__grid">
          <article><h3>${escapeHtml(t("aiResult.purpose"))}</h3><p>${escapeHtml(localizeAiText(result.purpose || t("aiResult.noItems")))}</p></article>
          <article><h3>${escapeHtml(t("aiResult.outcome"))}</h3><p>${escapeHtml(localizeAiText(result.outcome || t("aiResult.noItems")))}</p></article>
          <article><h3>${escapeHtml(t("aiResult.keyPoints"))}</h3>${renderAiList(result.key_points)}</article>
          <article><h3>${escapeHtml(t("aiResult.actionItems"))}</h3>${renderAiList(result.action_items)}</article>
        </div>
        <article><h3>${escapeHtml(t("aiResult.tags"))}</h3><div class="recording-target-summary">${aiResultArray(result.tags).length ? aiResultArray(result.tags).map(tag => `<span>${escapeHtml(localizeAiText(tag))}</span>`).join("") : `<span>${escapeHtml(t("aiResult.noItems"))}</span>`}</div></article>
      </section>
      <section class="ai-transcript">
        <header><h3>${escapeHtml(t("aiResult.transcript"))}</h3><span>${transcript.length}</span></header>
        ${transcript.length ? transcript.map(segment => `
          <article class="ai-transcript__row">
            <div class="ai-transcript__meta">
              <strong>${escapeHtml(aiParticipantLabel(segment.participant_id))}</strong>
              <span class="mono-cell">${Number(segment.start_ms || 0)}-${Number(segment.end_ms || 0)} ${escapeHtml(t("aiResult.timeUnit"))}</span>
              <span class="status-pill ${segment.final_segment ? "ok" : ""}">${escapeHtml(t(segment.final_segment ? "aiResult.final" : "aiResult.partial"))}</span>
            </div>
            <p>${escapeHtml(segment.text || "")}</p>
          </article>`).join("") : `<div class="empty-state empty-state--plain">${escapeHtml(t("aiResult.noItems"))}</div>`}
      </section>
    `;
  }

  async function openAiResults(callId) {
    const domainId = state.forcedDomainId || els.cdrDomain.value;
    if (!domainId) return;
    els.aiResultTitle.textContent = callId;
    els.aiResultVersion.innerHTML = "";
    els.aiResultVersion.disabled = true;
    els.aiResultBody.innerHTML = `<div class="empty-state empty-state--plain">${escapeHtml(t("state.loading"))}</div>`;
    if (!els.aiResultDialog.open) els.aiResultDialog.showModal();
    try {
      const response = await api(`/api/cdr/${encodeURIComponent(callId)}/ai-results?domain=${encodeURIComponent(domainId)}`);
      const records = aiResultArray(objectData(response).results)
        .sort((left, right) => Number(right.result_version || 0) - Number(left.result_version || 0));
      els.aiResultVersion.innerHTML = records.map((record, index) => `<option value="${index}">v${escapeHtml(record.result_version ?? "-")}</option>`).join("");
      els.aiResultVersion.disabled = records.length < 2;
      const selectResult = () => renderAiResult(records[Number(els.aiResultVersion.value || 0)]);
      els.aiResultVersion.onchange = selectResult;
      renderAiResult(records[0]);
    } catch (error) {
      els.aiResultBody.innerHTML = `<div class="empty-state empty-state--plain">${escapeHtml(error.message || t("aiResult.empty"))}</div>`;
    }
  }

  function renderCdrDirection(record, direction) {
    const route = record[`${direction}_route_name`];
    const trunk = record[`${direction}_trunk_name`];
    const items = [route, trunk].filter(Boolean);
    if (!items.length) return "";
    return `<span class="cdr-path-value">${items.map(escapeHtml).join('<span aria-hidden="true">/</span>')}</span>`;
  }

  function recordingStateLabel(status) {
    if (!status) return t("recording.notRecorded");
    const label = t(`recording.status.${status}`);
    return label.startsWith("recording.status.") ? status : label;
  }

  function mediaForwardingLabel(mode) {
    if (!mode) return "-";
    const label = t(`cdr.forwarding.${mode}`);
    return label.startsWith("cdr.forwarding.") ? mode : label;
  }

  function traceLaneHeader(label, address, hint = "") {
    return `<strong>${escapeHtml(label)}</strong><small>${escapeHtml(address || hint)}</small>`;
  }

  function relativeTraceTime(observedAtMs, firstObservedAtMs) {
    const delta = Math.max(0, Number(observedAtMs || 0) - Number(firstObservedAtMs || 0));
    return `+${(delta / 1000).toFixed(3)}s`;
  }

  function renderTrace(trace, record) {
    const messages = trace.messages || [];
    const firstObservedAtMs = messages[0]?.observed_at_ms || 0;
    els.traceTitle.textContent = trace.call_id || record?.call_id || "-";
    els.traceCount.textContent = t("trace.count", { count: messages.length });
    els.traceIncomplete.hidden = !trace.incomplete;
    els.traceEmpty.hidden = messages.length > 0;
    els.traceCallerLane.innerHTML = traceLaneHeader(
      t("trace.endpointCaller", { number: record?.caller_number || "-" }),
      tracePeerAddress(messages, "caller")
    );
    els.tracePbxLane.innerHTML = traceLaneHeader(t("trace.pbx"), "", t("trace.pbxHint"));
    els.traceCalleeLane.innerHTML = traceLaneHeader(
      t("trace.endpointCallee", { number: record?.callee_number || "-" }),
      tracePeerAddress(messages, "callee")
    );
    els.traceRows.innerHTML = messages.map((message, index) => {
      const arrow = traceArrow(message);
      const leg = traceLeg(message);
      const absoluteTime = formatDateTime(message.observed_at_ms);
      const relativeTime = relativeTraceTime(message.observed_at_ms, firstObservedAtMs);
      return `
        <div class="trace-flow-row trace-flow-row--${leg}">
          <div class="trace-flow-row__time">
            <time datetime="${escapeHtml(new Date(Number(message.observed_at_ms || 0)).toISOString())}">${escapeHtml(absoluteTime)}</time>
            <span>${escapeHtml(relativeTime)}</span>
          </div>
          <div class="trace-flow-row__diagram">
            <button
              class="trace-flow-arrow ${arrow.reverse ? "trace-flow-arrow--reverse" : ""} ${index === 0 ? "is-selected" : ""}"
              type="button"
              data-trace-index="${index}"
              style="left:${arrow.left}%;width:${arrow.width}%"
              title="${escapeHtml(message.start_line || "-")}"
            >
              <span>${escapeHtml(message.start_line || "-")}</span>
            </button>
          </div>
        </div>
      `;
    }).join("");
    const selectMessage = index => {
      const message = messages[index];
      els.traceRows.querySelectorAll("[data-trace-index]").forEach(row => {
        row.classList.toggle("is-selected", Number(row.dataset.traceIndex) === index);
      });
      els.tracePacket.textContent = message?.packet || "";
      els.tracePacketMeta.textContent = message
        ? `${String(message.direction || "").toUpperCase()} · leg ${message.adapter_call_leg_id || "-"} · ${formatDateTime(message.observed_at_ms)}`
        : "";
    };
    els.traceRows.querySelectorAll("[data-trace-index]").forEach(row => {
      row.addEventListener("click", () => selectMessage(Number(row.dataset.traceIndex)));
    });
    selectMessage(0);
  }

  async function openCallTrace(callId) {
    const record = state.cdrRecords.find(item => item.call_id === callId);
    els.traceTitle.textContent = callId;
    els.traceCount.textContent = "";
    els.traceIncomplete.hidden = true;
    els.traceRows.innerHTML = "";
    els.tracePacket.textContent = "";
    els.tracePacketMeta.textContent = "";
    els.traceEmpty.hidden = true;
    if (!els.traceDialog.open) els.traceDialog.showModal();
    try {
      let result;
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          result = await api(`/api/cdr/${encodeURIComponent(callId)}/trace`);
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) await new Promise(resolve => window.setTimeout(resolve, 120));
        }
      }
      if (!result) throw lastError || new Error("trace unavailable");
      renderTrace(objectData(result), record);
    } catch (error) {
      els.traceEmpty.hidden = false;
      els.tracePacket.textContent = error.message || "";
    }
  }

  function renderCdrPagination() {
    const pages = Math.max(1, Math.ceil(state.cdrTotal / state.cdrPageSize));
    els.cdrPagination.innerHTML = `
      <button class="icon-button" type="button" data-cdr-prev title="${escapeHtml(t("pagination.previous"))}" ${state.cdrPage <= 1 ? "disabled" : ""}>←</button>
      <span>${escapeHtml(t("pagination.page", { page: state.cdrPage, pages, total: state.cdrTotal }))}</span>
      <button class="icon-button" type="button" data-cdr-next title="${escapeHtml(t("pagination.next"))}" ${state.cdrPage >= pages ? "disabled" : ""}>→</button>
    `;
    els.cdrPagination.querySelector("[data-cdr-prev]")?.addEventListener("click", () => {
      state.cdrPage -= 1;
      loadCdr();
    });
    els.cdrPagination.querySelector("[data-cdr-next]")?.addEventListener("click", () => {
      state.cdrPage += 1;
      loadCdr();
    });
  }

  async function loadCdr() {
    const params = new URLSearchParams({
      page: String(state.cdrPage),
      page_size: String(state.cdrPageSize)
    });
    const domainId = state.forcedDomainId || els.cdrDomain.value;
    if (domainId) params.set("domain", domainId);
    const result = await api(`/api/cdr?${params}`);
    const data = objectData(result);
    const records = data.records || [];
    state.cdrTotal = Number(data.pagination?.total || 0);
    updateDomainOptions();
    renderCdr(records);
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = window.setInterval(() => {
      if (state.activeView === "calls" && document.visibilityState === "visible") {
        loadCalls().catch(console.error);
      }
    }, 5000);
  }

  function stopPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  els.callsDomain.addEventListener("change", loadCalls);
  els.cdrDomain.addEventListener("change", () => {
    state.cdrPage = 1;
    loadCdr();
  });
  els.cdrPageSize.addEventListener("change", () => {
    state.cdrPageSize = Number(els.cdrPageSize.value);
    state.cdrPage = 1;
    loadCdr();
  });
  els.traceClose.addEventListener("click", () => els.traceDialog.close());
  els.traceDialog.addEventListener("click", event => {
    if (event.target === els.traceDialog) els.traceDialog.close();
  });
  els.aiResultClose.addEventListener("click", () => els.aiResultDialog.close());
  els.aiResultDialog.addEventListener("click", event => {
    if (event.target === els.aiResultDialog) els.aiResultDialog.close();
  });

  return {
    setDomain(domainId) {
      if (state.forcedDomainId !== domainId) {
        state.cdrPage = 1;
        state.selectedCallId = null;
      }
      state.forcedDomainId = domainId || null;
      updateDomainOptions();
    },
    async activate(view) {
      state.activeView = view;
      if (view === "calls") {
        await ensureDomains();
        await loadCalls();
        startPolling();
      } else {
        stopPolling();
        if (view === "cdr") {
          await ensureDomains();
          await loadCdr();
        }
      }
    },
    async refresh(view) {
      if (view === "calls") await loadCalls();
      if (view === "cdr") await loadCdr();
    }
  };
}
