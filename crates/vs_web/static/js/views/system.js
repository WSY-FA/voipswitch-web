import { api, commandData } from "../core/api.js";
import { formatDateTime } from "../core/format.js";

const SAMPLE_INTERVAL_MS = 5000;
const MAX_SAMPLES = 60;
const CHART_WIDTH = 320;
const CHART_HEIGHT = 112;
const CHART_PADDING = 4;

export function createSystemView({ t, fetchStatus }) {
  const history = [];
  let currentView = "";
  let pollTimer = null;
  let lastStatus = {};

  const els = {
    form: document.getElementById("systemSettingsForm"),
    saveButton: document.getElementById("saveSystemSettingsButton"),
    sipPort: document.getElementById("systemSipPortInput"),
    logLevel: document.getElementById("systemLogLevelInput"),
    callTrace: document.getElementById("systemCallTraceInput"),
    dataDir: document.getElementById("systemDataDirInput"),
    recordingDir: document.getElementById("systemRecordingDirInput"),
    recordingRetention: document.getElementById("systemRecordingRetentionInput"),
    recordingMaxSize: document.getElementById("systemRecordingMaxSizeInput"),
    cdrSpoolWarning: document.getElementById("systemCdrSpoolWarningInput"),
    cdrSpoolResume: document.getElementById("systemCdrSpoolResumeInput"),
    cdrSpoolReject: document.getElementById("systemCdrSpoolRejectInput"),
    callTraceState: document.getElementById("systemCallTraceState"),
    appliedSipPort: document.getElementById("systemAppliedSipPort"),
    sipPortState: document.getElementById("systemSipPortState"),
    message: document.getElementById("systemSettingsMessage"),
    telemetryUpdatedAt: document.getElementById("telemetryUpdatedAt"),
    cpuValue: document.getElementById("cpuCurrentValue"),
    memoryValue: document.getElementById("memoryCurrentValue"),
    callsValue: document.getElementById("callsCurrentValue"),
    cpuLine: document.getElementById("cpuTrendLine"),
    memoryLine: document.getElementById("memoryTrendLine"),
    callsLine: document.getElementById("callsTrendLine")
  };

  els.form.addEventListener("submit", saveSettings);
  els.callTrace.addEventListener("change", renderCallTraceState);
  document.addEventListener("visibilitychange", updatePolling);

  function recordStatus(status) {
    lastStatus = status || {};
    const sampledAt = Number(status.sampled_at_ms || Date.now());
    if (history.at(-1)?.sampledAt !== sampledAt) {
      const memoryTotal = Number(status.memory_total_bytes || 0);
      const memoryUsed = Number(status.memory_used_bytes || 0);
      history.push({
        sampledAt,
        cpu: finiteOrNull(status.cpu_percent),
        memory: memoryTotal > 0 ? memoryUsed * 100 / memoryTotal : null,
        calls: Math.max(0, Number(status.active_call_count || 0))
      });
      if (history.length > MAX_SAMPLES) history.shift();
    }
    renderTelemetry();
    renderAppliedPort();
  }

  async function activate(view) {
    currentView = view;
    updatePolling();
    if (view === "system") {
      await loadSettings();
    }
  }

  async function refresh(view) {
    if (view === "system") {
      await loadSettings();
      await fetchStatus();
      return;
    }
    if (view === "status") {
      await fetchStatus();
    }
  }

  function updatePolling() {
    const shouldPoll = currentView === "status" && document.visibilityState !== "hidden";
    if (!shouldPoll) {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    if (pollTimer === null) {
      pollTimer = window.setInterval(() => {
        fetchStatus().catch(() => {});
      }, SAMPLE_INTERVAL_MS);
    }
  }

  async function loadSettings() {
    setMessage("");
    const result = await api("/api/system-settings");
    const data = commandData(result);
    const settings = Object.fromEntries(
      (data.rows || []).map(row => [row.key, row.value])
    );
    els.sipPort.value = Number(settings.sip_port || 5060);
    els.logLevel.value = String(settings.log_level || "info");
    els.callTrace.checked = settings.call_trace_enabled !== false;
    els.dataDir.value = String(lastStatus.data_dir || "");
    els.recordingDir.value = String(
      settings.recording_dir || lastStatus.recording_dir || ""
    );
    els.recordingRetention.value = Number(settings.recording_retention_days || 30);
    els.recordingMaxSize.value = Number(settings.recording_max_size_gb || 20);
    els.cdrSpoolWarning.value = Number(settings.cdr_spool_warning_mb || 512);
    els.cdrSpoolResume.value = Number(settings.cdr_spool_resume_mb || 800);
    els.cdrSpoolReject.value = Number(settings.cdr_spool_reject_mb || 1024);
    renderCallTraceState();
    renderAppliedPort();
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!els.form.reportValidity()) return;
    const cdrSpoolWarning = Number(els.cdrSpoolWarning.value);
    const cdrSpoolResume = Number(els.cdrSpoolResume.value);
    const cdrSpoolReject = Number(els.cdrSpoolReject.value);
    if (!validCdrSpoolLimits(cdrSpoolWarning, cdrSpoolResume, cdrSpoolReject)) {
      setMessage(t("systemSettings.cdrSpoolOrderError"), "error");
      return;
    }
    els.saveButton.disabled = true;
    setMessage("");
    try {
      await api("/api/system-settings", {
        method: "PATCH",
        body: JSON.stringify({
          sip_port: Number(els.sipPort.value),
          log_level: els.logLevel.value,
          call_trace_enabled: els.callTrace.checked,
          recording_dir: els.recordingDir.value.trim(),
          recording_retention_days: Number(els.recordingRetention.value),
          recording_max_size_gb: Number(els.recordingMaxSize.value),
          cdr_spool_warning_mb: cdrSpoolWarning,
          cdr_spool_reject_mb: cdrSpoolReject,
          cdr_spool_resume_mb: cdrSpoolResume
        })
      });
      await fetchStatus();
      await loadSettings();
      setMessage(t("message.systemSettingsSaved"), "ok");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      els.saveButton.disabled = false;
    }
  }

  function renderCallTraceState() {
    els.callTraceState.textContent = t(
      els.callTrace.checked ? "state.registerOn" : "state.registerOff"
    );
  }

  function renderAppliedPort() {
    const applied = lastStatus.adapter_sip_port;
    els.appliedSipPort.textContent = applied ?? "-";
    els.sipPortState.classList.remove("ok", "warn");
    if (applied == null) {
      els.sipPortState.textContent = t("systemSettings.adapterOffline");
      els.sipPortState.classList.add("warn");
      return;
    }
    if (lastStatus.adapter_bind_source === "cli") {
      els.sipPortState.textContent = t("systemSettings.cliOverride");
      els.sipPortState.classList.add("warn");
      return;
    }
    if (lastStatus.sip_restart_required) {
      els.sipPortState.textContent = t("systemSettings.restartRequired");
      els.sipPortState.classList.add("warn");
      return;
    }
    els.sipPortState.textContent = t("systemSettings.applied");
    els.sipPortState.classList.add("ok");
  }

  function renderTelemetry() {
    const latest = history.at(-1);
    els.telemetryUpdatedAt.textContent = latest
      ? formatDateTime(latest.sampledAt)
      : "-";
    els.cpuValue.textContent = latest?.cpu == null ? "-" : `${latest.cpu.toFixed(1)}%`;
    els.memoryValue.textContent = latest?.memory == null
      ? "-"
      : `${latest.memory.toFixed(1)}%`;
    els.callsValue.textContent = latest?.calls ?? 0;

    setLine(els.cpuLine, history.map(sample => sample.cpu), 100);
    setLine(els.memoryLine, history.map(sample => sample.memory), 100);
    const callPeak = Math.max(1, ...history.map(sample => sample.calls));
    setLine(els.callsLine, history.map(sample => sample.calls), callPeak);
  }

  function setLine(element, values, maximum) {
    element.setAttribute("points", buildChartPoints(values, maximum));
  }

  function setMessage(text, kind = "") {
    els.message.textContent = text;
    els.message.className = `system-settings__message ${kind}`;
  }

  return { activate, refresh, recordStatus };
}

export function buildChartPoints(values, maximum) {
  if (values.length === 0 || maximum <= 0) return "";
    let previous = 0;
    const points = values.map((rawValue, index) => {
      const value = rawValue == null ? previous : Number(rawValue);
      previous = value;
      const x = values.length === 1
        ? CHART_PADDING
        : CHART_PADDING + index * (CHART_WIDTH - CHART_PADDING * 2) / (values.length - 1);
      const y = CHART_HEIGHT - CHART_PADDING
        - Math.min(maximum, Math.max(0, value)) / maximum
        * (CHART_HEIGHT - CHART_PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  return points.join(" ");
}

export function validCdrSpoolLimits(warning, resume, reject) {
  return Number.isFinite(warning)
    && Number.isFinite(resume)
    && Number.isFinite(reject)
    && warning > 0
    && warning < resume
    && resume < reject;
}

function finiteOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
