import { t } from "./i18n.js";

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const detail = payload.error;
    const localized = detail?.code ? t(`errors.${detail.code}`) : "";
    const error = new Error(
      localized && localized !== `errors.${detail?.code}`
        ? localized
        : t("message.requestFailed")
    );
    error.code = detail?.code;
    error.requestId = detail?.request_id;
    if (response.status === 401 && path !== "/api/auth/login") {
      window.dispatchEvent(new CustomEvent("voipswitch:auth-required"));
    }
    throw error;
  }
  return payload.result;
}

export function kvItems(result) {
  if (result?.data?.render !== "kv") {
    throw new Error(t("message.unexpectedResult"));
  }
  return result.data.payload.items;
}

export function commandData(result) {
  if (result?.data?.render !== "object") {
    throw new Error(t("message.unexpectedResult"));
  }
  return result.data.payload.value.data;
}

export function tableRows(result) {
  if (result?.data?.render !== "table") return [];
  const { columns = [], rows = [] } = result.data.payload;
  return rows.map(row => Object.fromEntries(
    columns.map((column, index) => [column, row[index] ?? null])
  ));
}

export function objectData(result) {
  if (result?.data?.render !== "object") return {};
  return result.data.payload.value?.data || {};
}
