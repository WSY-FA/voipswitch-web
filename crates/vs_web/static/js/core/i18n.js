const LANGUAGE_KEY = "voipswitch_web_language";
const LANGUAGE_FILES = ["zh-CN", "en-US"];
let labels = {};
let locale = "zh-CN";

export function preferredLanguage() {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (LANGUAGE_FILES.includes(saved)) return saved;
  return navigator.languages?.some(item => item.toLowerCase().startsWith("zh")) ? "zh-CN" : "en-US";
}

export async function loadI18n(preferred = preferredLanguage()) {
  const selected = LANGUAGE_FILES.includes(preferred) ? preferred : "zh-CN";
  const fallbackResponse = await fetch("/static/i18n/zh-CN.json", { cache: "no-store" });
  if (!fallbackResponse.ok) {
    throw new Error("load i18n failed");
  }
  const fallbackLabels = await fallbackResponse.json();
  if (selected === "zh-CN") {
    labels = fallbackLabels;
  } else {
    const response = await fetch(`/static/i18n/${selected}.json`, { cache: "no-store" });
    labels = response.ok ? { ...fallbackLabels, ...await response.json() } : fallbackLabels;
  }
  locale = selected;
  localStorage.setItem(LANGUAGE_KEY, selected);
  document.documentElement.lang = selected;
}

export function t(key, params = {}) {
  let text = labels[key] || key;
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(node => {
    node.textContent = t(node.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
    node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach(node => {
    node.setAttribute("title", t(node.getAttribute("data-i18n-title")));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(node => {
    node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label")));
  });
  document.title = t("page.documentTitle");
}

export function currentLanguage() {
  return locale;
}
