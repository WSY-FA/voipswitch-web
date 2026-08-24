import { createRuntimeViews } from "./runtime.js";
import { createAiView } from "./ai.js";
import { createRecordingView } from "./recording.js";
import { createSystemView } from "./system.js";
import { createAiGatewayView } from "./ai-gateway.js";
import { createUsersView } from "./users.js";
import { api, commandData, kvItems } from "../core/api.js";
import { escapeHtml } from "../core/format.js";
import { applyI18n, currentLanguage, loadI18n, t } from "../core/i18n.js";
import {
  findRegistration,
  indexRegistration
} from "../core/registrations.js";

let runtimeViews;
let aiView;
let recordingView;
let systemView;
let aiGatewayView;
let usersView;

const state = {
  principal: null,
  currentView: "status",
  currentTab: "extensions",
  trunkView: "peer",
  routeView: "outbound",
  status: {},
  domains: [],
  filteredDomains: [],
  selectedDomainId: null,
  selectedDomain: null,
  editingExtensionId: null,
  editingPeerTrunkId: null,
  editingOutboundRouteId: null,
  editingRegTrunkId: null,
  editingRegAccountId: null,
  editingInboundRouteId: null,
  editingAiAgentId: null,
  extensions: [],
  trunks: [],
  regTrunks: [],
  regAccounts: [],
  routes: [],
  inboundRoutes: [],
  aiAgents: [],
  aiProfiles: [],
  trunkOptions: [],
  regTrunkOptions: [],
  extensionOptions: [],
  routeTrunkRefs: [],
  registrations: new Map(),
  mirrorReady: false,
  trunkRegistrations: new Map(),
  trunkHealth: new Map(),
  trunkMirrorReady: false,
  registrationCounts: new Map(),
  extensionCounts: new Map(),
  pages: {
    domains: 1,
    extensions: 1,
    trunks: 1,
    regTrunks: 1,
    routes: 1,
    inboundRoutes: 1,
    aiAgents: 1
  },
  pagination: {
    domains: null,
    extensions: null,
    trunks: null,
    regTrunks: null,
    routes: null,
    inboundRoutes: null,
    aiAgents: null
  },
  pageSize: 20
};

const els = {
  loginScreen: document.getElementById("loginScreen"),
  loginForm: document.getElementById("loginForm"),
  loginUsernameInput: document.getElementById("loginUsernameInput"),
  loginPasswordInput: document.getElementById("loginPasswordInput"),
  loginSubmitButton: document.getElementById("loginSubmitButton"),
  loginMessage: document.getElementById("loginMessage"),
  appShell: document.getElementById("appShell"),
  globalNavigation: document.getElementById("globalNavigation"),
  domainNavigation: document.getElementById("domainNavigation"),
  domainContextName: document.getElementById("domainContextName"),
  domainContextSelect: document.getElementById("domainContextSelect"),
  currentUserAvatar: document.getElementById("currentUserAvatar"),
  currentUsername: document.getElementById("currentUsername"),
  currentUserRole: document.getElementById("currentUserRole"),
  logoutButton: document.getElementById("logoutButton"),
  languageSelect: document.getElementById("languageSelect"),
  languageSelectApp: document.getElementById("languageSelectApp"),
  sidebarSystemStatus: document.getElementById("sidebarSystemStatus"),
  navStatusButton: document.getElementById("navStatusButton"),
  navCallsButton: document.getElementById("navCallsButton"),
  navCdrButton: document.getElementById("navCdrButton"),
  navRecordingButton: document.getElementById("navRecordingButton"),
  navAiButton: document.getElementById("navAiButton"),
  navSystemButton: document.getElementById("navSystemButton"),
  navAiGatewayButton: document.getElementById("navAiGatewayButton"),
  navDomainsButton: document.getElementById("navDomainsButton"),
  navUsersButton: document.getElementById("navUsersButton"),
  navDomainOverviewButton: document.getElementById("navDomainOverviewButton"),
  navDomainExtensionsButton: document.getElementById("navDomainExtensionsButton"),
  navDomainAiAgentsButton: document.getElementById("navDomainAiAgentsButton"),
  navDomainTrunksButton: document.getElementById("navDomainTrunksButton"),
  navDomainRoutesButton: document.getElementById("navDomainRoutesButton"),
  exitDomainButton: document.getElementById("exitDomainButton"),
  sidebarCoreState: document.getElementById("sidebarCoreState"),
  sidebarConfigVersion: document.getElementById("sidebarConfigVersion"),
  sidebarAdapterCount: document.getElementById("sidebarAdapterCount"),
  pageEyebrow: document.getElementById("pageEyebrow"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  backToDomainsButton: document.getElementById("backToDomainsButton"),
  refreshButton: document.getElementById("refreshButton"),
  statusView: document.getElementById("statusView"),
  domainOverviewView: document.getElementById("domainOverviewView"),
  callsView: document.getElementById("callsView"),
  cdrView: document.getElementById("cdrView"),
  recordingView: document.getElementById("recordingView"),
  aiView: document.getElementById("aiView"),
  systemView: document.getElementById("systemView"),
  aiGatewayView: document.getElementById("aiGatewayView"),
  domainListView: document.getElementById("domainListView"),
  usersView: document.getElementById("usersView"),
  domainDetailView: document.getElementById("domainDetailView"),
  domainOverviewRealm: document.getElementById("domainOverviewRealm"),
  domainOverviewRemark: document.getElementById("domainOverviewRemark"),
  domainOverviewState: document.getElementById("domainOverviewState"),
  domainOverviewExtensionCount: document.getElementById("domainOverviewExtensionCount"),
  domainOverviewRegisteredCount: document.getElementById("domainOverviewRegisteredCount"),
  domainOverviewTrunkCount: document.getElementById("domainOverviewTrunkCount"),
  domainOverviewRouteCount: document.getElementById("domainOverviewRouteCount"),
  domainOverviewCallsButton: document.getElementById("domainOverviewCallsButton"),
  domainOverviewExtensionsButton: document.getElementById("domainOverviewExtensionsButton"),
  domainOverviewRecordingButton: document.getElementById("domainOverviewRecordingButton"),
  domainOverviewAiButton: document.getElementById("domainOverviewAiButton"),
  metricDomainCount: document.getElementById("metricDomainCount"),
  metricExtensionCount: document.getElementById("metricExtensionCount"),
  metricRegisteredCount: document.getElementById("metricRegisteredCount"),
  metricAdapterCount: document.getElementById("metricAdapterCount"),
  statusService: document.getElementById("statusService"),
  statusInstance: document.getElementById("statusInstance"),
  statusVersion: document.getElementById("statusVersion"),
  statusResources: document.getElementById("statusResources"),
  statusDomainQuickList: document.getElementById("statusDomainQuickList"),
  domainSearchInput: document.getElementById("domainSearchInput"),
  openDomainCreateButton: document.getElementById("openDomainCreateButton"),
  domainTableBody: document.getElementById("domainTableBody"),
  domainEmptyState: document.getElementById("domainEmptyState"),
  domainPagination: document.getElementById("domainPagination"),
  extensionsSubview: document.getElementById("extensionsSubview"),
  trunksSubview: document.getElementById("trunksSubview"),
  routesSubview: document.getElementById("routesSubview"),
  showPeerTrunksButton: document.getElementById("showPeerTrunksButton"),
  showRegTrunksButton: document.getElementById("showRegTrunksButton"),
  peerTrunkTabCount: document.getElementById("peerTrunkTabCount"),
  regTrunkTabCount: document.getElementById("regTrunkTabCount"),
  peerTrunksPane: document.getElementById("peerTrunksPane"),
  regTrunksPane: document.getElementById("regTrunksPane"),
  showOutboundRoutesButton: document.getElementById("showOutboundRoutesButton"),
  showInboundRoutesButton: document.getElementById("showInboundRoutesButton"),
  outboundRouteTabCount: document.getElementById("outboundRouteTabCount"),
  inboundRouteTabCount: document.getElementById("inboundRouteTabCount"),
  outboundRoutesPane: document.getElementById("outboundRoutesPane"),
  inboundRoutesPane: document.getElementById("inboundRoutesPane"),
  extensionTableBody: document.getElementById("extensionTableBody"),
  extensionEmptyState: document.getElementById("extensionEmptyState"),
  trunkTableBody: document.getElementById("trunkTableBody"),
  trunkEmptyState: document.getElementById("trunkEmptyState"),
  regTrunkTableBody: document.getElementById("regTrunkTableBody"),
  regTrunkEmptyState: document.getElementById("regTrunkEmptyState"),
  routeTableBody: document.getElementById("routeTableBody"),
  routeEmptyState: document.getElementById("routeEmptyState"),
  inboundRouteTableBody: document.getElementById("inboundRouteTableBody"),
  inboundRouteEmptyState: document.getElementById("inboundRouteEmptyState"),
  aiAgentsSubview: document.getElementById("aiAgentsSubview"),
  aiAgentTableBody: document.getElementById("aiAgentTableBody"),
  aiAgentEmptyState: document.getElementById("aiAgentEmptyState"),
  aiAgentPagination: document.getElementById("aiAgentPagination"),
  extensionPagination: document.getElementById("extensionPagination"),
  trunkPagination: document.getElementById("trunkPagination"),
  regTrunkPagination: document.getElementById("regTrunkPagination"),
  routePagination: document.getElementById("routePagination"),
  inboundRoutePagination: document.getElementById("inboundRoutePagination"),
  openExtensionCreateButton: document.getElementById("openExtensionCreateButton"),
  openExtensionBatchButton: document.getElementById("openExtensionBatchButton"),
  openTrunkCreateButton: document.getElementById("openTrunkCreateButton"),
  openRegTrunkCreateButton: document.getElementById("openRegTrunkCreateButton"),
  openRouteCreateButton: document.getElementById("openRouteCreateButton"),
  openInboundRouteCreateButton: document.getElementById("openInboundRouteCreateButton"),
  detailSide: document.querySelector(".detail-side"),
  editorTitle: document.getElementById("editorTitle"),
  editorHint: document.getElementById("editorHint"),
  closeEditorButton: document.getElementById("closeEditorButton"),
  extensionForm: document.getElementById("extensionForm"),
  extNumberInput: document.getElementById("extNumberInput"),
  extAuthUserInput: document.getElementById("extAuthUserInput"),
  extPasswordInput: document.getElementById("extPasswordInput"),
  extEnabledInput: document.getElementById("extEnabledInput"),
  toggleExtPasswordButton: document.getElementById("toggleExtPasswordButton"),
  resetExtensionButton: document.getElementById("resetExtensionButton"),
  extensionBatchForm: document.getElementById("extensionBatchForm"),
  batchStartInput: document.getElementById("batchStartInput"),
  batchCountInput: document.getElementById("batchCountInput"),
  batchPasswordInput: document.getElementById("batchPasswordInput"),
  batchEnabledInput: document.getElementById("batchEnabledInput"),
  toggleBatchPasswordButton: document.getElementById("toggleBatchPasswordButton"),
  resetExtensionBatchButton: document.getElementById("resetExtensionBatchButton"),
  trunkForm: document.getElementById("trunkForm"),
  trunkNameInput: document.getElementById("trunkNameInput"),
  trunkServerHostInput: document.getElementById("trunkServerHostInput"),
  trunkServerPortInput: document.getElementById("trunkServerPortInput"),
  trunkProxyHostInput: document.getElementById("trunkProxyHostInput"),
  trunkProxyPortInput: document.getElementById("trunkProxyPortInput"),
  trunkTransportInput: document.getElementById("trunkTransportInput"),
  trunkKeepAliveInput: document.getElementById("trunkKeepAliveInput"),
  trunkEnabledInput: document.getElementById("trunkEnabledInput"),
  resetTrunkButton: document.getElementById("resetTrunkButton"),
  routeForm: document.getElementById("routeForm"),
  routeNameInput: document.getElementById("routeNameInput"),
  routeDstPatternInput: document.getElementById("routeDstPatternInput"),
  routeSrcPatternInput: document.getElementById("routeSrcPatternInput"),
  routePriorityInput: document.getElementById("routePriorityInput"),
  routeDstStripInput: document.getElementById("routeDstStripInput"),
  routeDstPrefixInput: document.getElementById("routeDstPrefixInput"),
  routeDstSuffixInput: document.getElementById("routeDstSuffixInput"),
  routeSrcStripInput: document.getElementById("routeSrcStripInput"),
  routeSrcPrefixInput: document.getElementById("routeSrcPrefixInput"),
  routeSrcSuffixInput: document.getElementById("routeSrcSuffixInput"),
  routeTrunkCandidateInput: document.getElementById("routeTrunkCandidateInput"),
  addRouteTrunkButton: document.getElementById("addRouteTrunkButton"),
  routeTrunkRefsList: document.getElementById("routeTrunkRefsList"),
  routeEnabledInput: document.getElementById("routeEnabledInput"),
  resetRouteButton: document.getElementById("resetRouteButton"),
  regTrunkForm: document.getElementById("regTrunkForm"),
  regTrunkNameInput: document.getElementById("regTrunkNameInput"),
  regTrunkServerHostInput: document.getElementById("regTrunkServerHostInput"),
  regTrunkServerPortInput: document.getElementById("regTrunkServerPortInput"),
  regTrunkProxyHostInput: document.getElementById("regTrunkProxyHostInput"),
  regTrunkProxyPortInput: document.getElementById("regTrunkProxyPortInput"),
  regTrunkTransportInput: document.getElementById("regTrunkTransportInput"),
  regTrunkKeepAliveInput: document.getElementById("regTrunkKeepAliveInput"),
  regTrunkExpiresInput: document.getElementById("regTrunkExpiresInput"),
  regTrunkEnabledInput: document.getElementById("regTrunkEnabledInput"),
  resetRegTrunkButton: document.getElementById("resetRegTrunkButton"),
  regAccountForm: document.getElementById("regAccountForm"),
  regAccountTrunkIdInput: document.getElementById("regAccountTrunkIdInput"),
  regAccountAuthNameInput: document.getElementById("regAccountAuthNameInput"),
  regAccountPasswordInput: document.getElementById("regAccountPasswordInput"),
  toggleRegAccountPasswordButton: document.getElementById("toggleRegAccountPasswordButton"),
  regAccountEnabledInput: document.getElementById("regAccountEnabledInput"),
  resetRegAccountButton: document.getElementById("resetRegAccountButton"),
  inboundRouteForm: document.getElementById("inboundRouteForm"),
  inboundRouteNameInput: document.getElementById("inboundRouteNameInput"),
  inboundRouteTrunkMatchInput: document.getElementById("inboundRouteTrunkMatchInput"),
  inboundRouteDstPatternInput: document.getElementById("inboundRouteDstPatternInput"),
  inboundRouteSrcPatternInput: document.getElementById("inboundRouteSrcPatternInput"),
  inboundRouteTargetInput: document.getElementById("inboundRouteTargetInput"),
  inboundRoutePriorityInput: document.getElementById("inboundRoutePriorityInput"),
  inboundRouteDstStripInput: document.getElementById("inboundRouteDstStripInput"),
  inboundRouteDstPrefixInput: document.getElementById("inboundRouteDstPrefixInput"),
  inboundRouteDstSuffixInput: document.getElementById("inboundRouteDstSuffixInput"),
  inboundRouteSrcStripInput: document.getElementById("inboundRouteSrcStripInput"),
  inboundRouteSrcPrefixInput: document.getElementById("inboundRouteSrcPrefixInput"),
  inboundRouteSrcSuffixInput: document.getElementById("inboundRouteSrcSuffixInput"),
  inboundRouteEnabledInput: document.getElementById("inboundRouteEnabledInput"),
  aiAgentForm: document.getElementById("aiAgentForm"),
  aiAgentIdInput: document.getElementById("aiAgentIdInput"),
  aiAgentNameInput: document.getElementById("aiAgentNameInput"),
  aiAgentServiceNumberInput: document.getElementById("aiAgentServiceNumberInput"),
  aiAgentProfileInput: document.getElementById("aiAgentProfileInput"),
  aiAgentFallbackTargetInput: document.getElementById("aiAgentFallbackTargetInput"),
  aiAgentEnabledInput: document.getElementById("aiAgentEnabledInput"),
  openAiAgentCreateButton: document.getElementById("openAiAgentCreateButton"),
  resetAiAgentButton: document.getElementById("resetAiAgentButton"),
  resetInboundRouteButton: document.getElementById("resetInboundRouteButton"),
  formMessage: document.getElementById("formMessage"),
  mirrorHint: document.getElementById("mirrorHint"),
  mirrorList: document.getElementById("mirrorList"),
  domainModal: document.getElementById("domainModal"),
  domainModalForm: document.getElementById("domainModalForm"),
  domainModalHiddenId: document.getElementById("domainModalHiddenId"),
  domainModalNameInput: document.getElementById("domainModalNameInput"),
  domainModalRealmInput: document.getElementById("domainModalRealmInput"),
  domainModalPasswordInput: document.getElementById("domainModalPasswordInput"),
  toggleDomainPasswordButton: document.getElementById("toggleDomainPasswordButton"),
  domainModalRemarkInput: document.getElementById("domainModalRemarkInput"),
  closeDomainModalButton: document.getElementById("closeDomainModalButton"),
  cancelDomainModalButton: document.getElementById("cancelDomainModalButton")
};

function pageQuery(pageName) {
  return `page=${encodeURIComponent(state.pages[pageName] || 1)}&page_size=${encodeURIComponent(state.pageSize)}`;
}

function fixedPageQuery(page = 1, pageSize = 500) {
  return `page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`;
}

function setFormMessage(text, kind = "") {
  els.formMessage.textContent = text;
  els.formMessage.className = `form-message ${kind}`;
}

function isSystemAdmin() {
  return state.principal?.role === "system_admin";
}

function isDomainView(view) {
  return ["domainOverview", "calls", "cdr", "recording", "ai", "detail"].includes(view);
}

function setView(view) {
  if (!isSystemAdmin() && ["status", "users", "system", "aiGateway"].includes(view)) {
    view = state.selectedDomainId ? "domainOverview" : "domains";
  }
  if (isDomainView(view) && !state.selectedDomainId) {
    view = "domains";
  }
  state.currentView = view;
  els.statusView.classList.toggle("view--active", view === "status");
  els.domainOverviewView.classList.toggle("view--active", view === "domainOverview");
  els.callsView.classList.toggle("view--active", view === "calls");
  els.cdrView.classList.toggle("view--active", view === "cdr");
  els.recordingView.classList.toggle("view--active", view === "recording");
  els.aiView.classList.toggle("view--active", view === "ai");
  els.systemView.classList.toggle("view--active", view === "system");
  els.aiGatewayView.classList.toggle("view--active", view === "aiGateway");
  els.domainListView.classList.toggle("view--active", view === "domains");
  els.usersView.classList.toggle("view--active", view === "users");
  els.domainDetailView.classList.toggle("view--active", view === "detail");
  els.navStatusButton.classList.toggle("active", view === "status");
  els.navCallsButton.classList.toggle("active", view === "calls");
  els.navCdrButton.classList.toggle("active", view === "cdr");
  els.navRecordingButton.classList.toggle("active", view === "recording");
  els.navAiButton.classList.toggle("active", view === "ai");
  els.navSystemButton.classList.toggle("active", view === "system");
  els.navAiGatewayButton.classList.toggle("active", view === "aiGateway");
  els.navDomainsButton.classList.toggle("active", view === "domains");
  els.navUsersButton.classList.toggle("active", view === "users");
  els.navDomainOverviewButton.classList.toggle("active", view === "domainOverview");
  els.navDomainExtensionsButton.classList.toggle("active", view === "detail" && state.currentTab === "extensions");
  els.navDomainAiAgentsButton.classList.toggle("active", view === "detail" && state.currentTab === "aiAgents");
  els.navDomainTrunksButton.classList.toggle("active", view === "detail" && ["trunks", "regTrunks", "regAccounts"].includes(state.currentTab));
  els.navDomainRoutesButton.classList.toggle("active", view === "detail" && ["routes", "inboundRoutes"].includes(state.currentTab));
  const domainContext = isDomainView(view) && Boolean(state.selectedDomainId);
  els.globalNavigation.hidden = domainContext || !isSystemAdmin();
  els.domainNavigation.hidden = !domainContext;
  els.sidebarSystemStatus.hidden = !isSystemAdmin();
  els.backToDomainsButton.hidden = true;
  runtimeViews?.setDomain(domainContext ? state.selectedDomainId : null);
  recordingView?.setDomain(domainContext ? state.selectedDomainId : null);
  aiView?.setDomain(domainContext ? state.selectedDomainId : null);
  runtimeViews?.activate(view).catch(error => setFormMessage(error.message, "error"));
  recordingView?.activate(view).catch(error => setFormMessage(error.message, "error"));
  aiView?.activate(view).catch(error => setFormMessage(error.message, "error"));
  systemView?.activate(view).catch(error => setFormMessage(error.message, "error"));
  usersView?.activate(view).catch(error => setFormMessage(error.message, "error"));

  if (view === "status") {
    els.pageEyebrow.textContent = t("page.status.eyebrow");
    els.pageTitle.textContent = t("page.status.title");
    els.pageSubtitle.textContent = t("page.status.subtitle");
  } else if (view === "calls") {
    els.pageEyebrow.textContent = t("page.calls.eyebrow");
    els.pageTitle.textContent = t("page.calls.title");
    els.pageSubtitle.textContent = t("page.calls.subtitle");
  } else if (view === "cdr") {
    els.pageEyebrow.textContent = t("page.cdr.eyebrow");
    els.pageTitle.textContent = t("page.cdr.title");
    els.pageSubtitle.textContent = t("page.cdr.subtitle");
  } else if (view === "recording") {
    els.pageEyebrow.textContent = t("page.recording.eyebrow");
    els.pageTitle.textContent = t("page.recording.title");
    els.pageSubtitle.textContent = t("page.recording.subtitle");
  } else if (view === "ai") {
    els.pageEyebrow.textContent = t("page.ai.eyebrow");
    els.pageTitle.textContent = t("page.ai.title");
    els.pageSubtitle.textContent = t("page.ai.subtitle");
  } else if (view === "system") {
    els.pageEyebrow.textContent = t("page.system.eyebrow");
    els.pageTitle.textContent = t("page.system.title");
    els.pageSubtitle.textContent = t("page.system.subtitle");
  } else if (view === "aiGateway") {
    els.pageEyebrow.textContent = t("page.aiGateway.eyebrow");
    els.pageTitle.textContent = t("page.aiGateway.title");
    els.pageSubtitle.textContent = t("page.aiGateway.subtitle");
  } else if (view === "domains") {
    els.pageEyebrow.textContent = t("page.domains.eyebrow");
    els.pageTitle.textContent = t("page.domains.title");
    els.pageSubtitle.textContent = t("page.domains.subtitle");
  } else if (view === "users") {
    els.pageEyebrow.textContent = t("page.users.eyebrow");
    els.pageTitle.textContent = t("page.users.title");
    els.pageSubtitle.textContent = t("page.users.subtitle");
  } else if (view === "domainOverview" && state.selectedDomain) {
    els.pageEyebrow.textContent = t("page.domainOverview.eyebrow");
    els.pageTitle.textContent = state.selectedDomain.name || state.selectedDomain.domain_id;
    els.pageSubtitle.textContent = `${state.selectedDomain.realm} · ${state.selectedDomain.remark || "-"}`;
  } else if (view === "detail" && state.selectedDomain) {
    els.pageEyebrow.textContent = t("page.detail.eyebrow");
    els.pageTitle.textContent = state.selectedDomain.name || state.selectedDomain.domain_id;
    els.pageSubtitle.textContent = `${state.selectedDomain.realm} · ${state.selectedDomain.remark || "-"}`;
  }
}

function setDetailTab(tab) {
  state.currentTab = tab;
  const viewTab = tab === "extensionBatch"
    ? "extensions"
    : ["regTrunks", "regAccounts"].includes(tab)
      ? "trunks"
      : tab === "inboundRoutes"
        ? "routes"
        : tab === "aiAgents" ? "aiAgents"
        : tab;
  els.extensionsSubview.classList.toggle("subview--active", viewTab === "extensions");
  els.aiAgentsSubview.classList.toggle("subview--active", viewTab === "aiAgents");
  els.trunksSubview.classList.toggle("subview--active", viewTab === "trunks");
  els.routesSubview.classList.toggle("subview--active", viewTab === "routes");
  els.extensionForm.classList.toggle("editor-form--active", tab === "extensions");
  els.extensionBatchForm.classList.toggle("editor-form--active", tab === "extensionBatch");
  els.trunkForm.classList.toggle("editor-form--active", tab === "trunks");
  els.routeForm.classList.toggle("editor-form--active", tab === "routes");
  els.regTrunkForm.classList.toggle("editor-form--active", tab === "regTrunks");
  els.regAccountForm.classList.toggle("editor-form--active", tab === "regAccounts");
  els.inboundRouteForm.classList.toggle("editor-form--active", tab === "inboundRoutes");
  els.aiAgentForm.classList.toggle("editor-form--active", tab === "aiAgents");

  if (tab === "extensions") {
    els.editorTitle.textContent = t("extensionForm.title");
    els.editorHint.textContent = t("extensionForm.hint");
  } else if (tab === "extensionBatch") {
    els.editorTitle.textContent = t("extensionBatchForm.title");
    els.editorHint.textContent = t("extensionBatchForm.hint");
  } else if (tab === "trunks") {
    els.editorTitle.textContent = t("trunkForm.title");
    els.editorHint.textContent = t("trunkForm.hint");
  } else if (tab === "routes") {
    els.editorTitle.textContent = t("routeForm.title");
    els.editorHint.textContent = t("routeForm.hint");
  } else if (tab === "regTrunks") {
    els.editorTitle.textContent = t("regTrunkForm.title");
    els.editorHint.textContent = t("regTrunkForm.hint");
  } else if (tab === "regAccounts") {
    els.editorTitle.textContent = t("regAccountForm.title");
    els.editorHint.textContent = t("regAccountForm.hint");
  } else if (tab === "aiAgents") {
    els.editorTitle.textContent = t("aiAgentForm.title");
    els.editorHint.textContent = t("aiAgentForm.hint");
  } else {
    els.editorTitle.textContent = t("inboundRouteForm.title");
    els.editorHint.textContent = t("inboundRouteForm.hint");
  }

  if (tab === "trunks") setTrunkView("peer");
  if (tab === "regTrunks" || tab === "regAccounts") setTrunkView("registered");
  if (tab === "routes") setRouteView("outbound");
  if (tab === "inboundRoutes") setRouteView("inbound");
  if (state.currentView === "detail") {
    els.navDomainExtensionsButton.classList.toggle("active", viewTab === "extensions");
    els.navDomainTrunksButton.classList.toggle("active", viewTab === "trunks");
    els.navDomainRoutesButton.classList.toggle("active", viewTab === "routes");
  }
}

function setTrunkView(view) {
  state.trunkView = view;
  const peer = view === "peer";
  els.showPeerTrunksButton.classList.toggle("active", peer);
  els.showPeerTrunksButton.setAttribute("aria-selected", String(peer));
  els.showRegTrunksButton.classList.toggle("active", !peer);
  els.showRegTrunksButton.setAttribute("aria-selected", String(!peer));
  els.peerTrunksPane.classList.toggle("resource-pane--active", peer);
  els.regTrunksPane.classList.toggle("resource-pane--active", !peer);
}

function setRouteView(view) {
  state.routeView = view;
  const outbound = view === "outbound";
  els.showOutboundRoutesButton.classList.toggle("active", outbound);
  els.showOutboundRoutesButton.setAttribute("aria-selected", String(outbound));
  els.showInboundRoutesButton.classList.toggle("active", !outbound);
  els.showInboundRoutesButton.setAttribute("aria-selected", String(!outbound));
  els.outboundRoutesPane.classList.toggle("resource-pane--active", outbound);
  els.inboundRoutesPane.classList.toggle("resource-pane--active", !outbound);
}

function updateSidebarStatus(connected) {
  els.sidebarCoreState.textContent = connected ? t("state.connected") : t("state.disconnected");
  els.sidebarCoreState.classList.toggle("ok", connected);
  els.sidebarCoreState.classList.toggle("warn", !connected);
}

function renderStatusSummary() {
  const domainCount = Number(state.pagination.domains?.total ?? state.domains.length);
  const extensionCount = state.domains.reduce((sum, domain) => sum + domainExtensionCount(domain), 0);
  const registeredCount = Array.from(state.registrationCounts.values()).reduce((sum, count) => sum + count, 0);
  els.metricDomainCount.textContent = domainCount;
  els.metricExtensionCount.textContent = extensionCount;
  els.metricRegisteredCount.textContent = registeredCount;
  els.metricAdapterCount.textContent = state.status.adapter_clients ?? 0;
}

function renderQuickDomains() {
  els.statusDomainQuickList.innerHTML = "";
  if (state.domains.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("domains.empty");
    els.statusDomainQuickList.appendChild(empty);
    return;
  }
  for (const domain of state.domains.slice(0, 6)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-domain";
    button.innerHTML = `
      <div>
        <div class="quick-domain__id">${escapeHtml(domain.name)}</div>
        <div class="quick-domain__meta">${escapeHtml(domain.realm)}</div>
      </div>
      <span class="chip">${escapeHtml(domainExtensionCount(domain))}</span>
    `;
    button.addEventListener("click", async () => {
      await openDomainOverview(domain.domain_id);
    });
    els.statusDomainQuickList.appendChild(button);
  }
}

function filterDomains() {
  const keyword = els.domainSearchInput.value.trim().toLowerCase();
  if (!keyword) {
    state.filteredDomains = [...state.domains];
    return;
  }
  state.filteredDomains = state.domains.filter(domain =>
    [domain.name, domain.realm, domain.remark, domain.domain_id]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(keyword))
  );
}

function pageRows(pageName, rows) {
  return rows;
}

function renderPagination(pageName, total, container) {
  const server = state.pagination[pageName];
  const pageSize = Number(server?.page_size || state.pageSize);
  const rowTotal = Number(server?.total ?? total);
  const totalPages = Math.max(1, Number(server?.total_pages || Math.ceil(rowTotal / pageSize)));
  const page = Math.min(Number(server?.page || state.pages[pageName] || 1), totalPages);
  state.pages[pageName] = page;
  container.innerHTML = "";
  const start = rowTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, rowTotal);
  container.innerHTML = `
    <span class="pagination__summary">${escapeHtml(t("pagination.summary", { total: rowTotal, pageSize, start, end }))}</span>
    <button class="icon-button" type="button" data-page-prev="${escapeHtml(pageName)}" ${page <= 1 ? "disabled" : ""} title="${escapeHtml(t("pagination.previous"))}" aria-label="${escapeHtml(t("pagination.previous"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <span class="pagination__page">${escapeHtml(t("pagination.position", { page, pages: totalPages }))}</span>
    <button class="icon-button" type="button" data-page-next="${escapeHtml(pageName)}" ${page >= totalPages ? "disabled" : ""} title="${escapeHtml(t("pagination.next"))}" aria-label="${escapeHtml(t("pagination.next"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
  container.querySelector("[data-page-prev]")?.addEventListener("click", () => {
    state.pages[pageName] = Math.max(1, page - 1);
    loadPagedTable(pageName).catch(error => setFormMessage(error.message, "error"));
  });
  container.querySelector("[data-page-next]")?.addEventListener("click", () => {
    state.pages[pageName] = Math.min(totalPages, page + 1);
    loadPagedTable(pageName).catch(error => setFormMessage(error.message, "error"));
  });
}

async function loadPagedTable(pageName) {
  if (pageName === "domains") await loadDomains();
  if (pageName === "extensions" && state.selectedDomainId) await loadExtensions(state.selectedDomainId);
  if (pageName === "trunks" && state.selectedDomainId) await loadPeerTrunks(state.selectedDomainId);
  if (pageName === "regTrunks" && state.selectedDomainId) await loadRegTrunks(state.selectedDomainId);
  if (pageName === "routes" && state.selectedDomainId) await loadOutboundRoutes(state.selectedDomainId);
  if (pageName === "inboundRoutes" && state.selectedDomainId) await loadInboundRoutes(state.selectedDomainId);
  if (pageName === "aiAgents" && state.selectedDomainId) await loadAiAgents(state.selectedDomainId);
}

function renderDomainTable() {
  filterDomains();
  const pageDomains = pageRows("domains", state.filteredDomains);
  els.domainTableBody.innerHTML = "";
  els.domainEmptyState.hidden = state.filteredDomains.length > 0;

  for (const domain of pageDomains) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(domain.domain_id)}</td>
      <td>${escapeHtml(domain.name || "-")}</td>
      <td>${escapeHtml(domain.realm || "-")}</td>
      <td>${escapeHtml(domain.remark || "-")}</td>
      <td>${escapeHtml(domainExtensionCount(domain))}</td>
      <td><span class="chip ${domain.enabled ? "enabled" : "off"}">${escapeHtml(domain.enabled ? t("state.enabled") : t("state.disabled"))}</span></td>
      <td class="actions-column">
        <div class="row-actions">
          <button class="icon-button" type="button" data-domain-open="${escapeHtml(domain.domain_id)}" aria-label="${escapeHtml(t("actions.open"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
          </button>
          ${isSystemAdmin() ? `<button class="icon-button" type="button" data-domain-edit="${escapeHtml(domain.domain_id)}" aria-label="${escapeHtml(t("actions.edit"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-button" type="button" data-domain-delete="${escapeHtml(domain.domain_id)}" aria-label="${escapeHtml(t("actions.delete"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>` : ""}
        </div>
      </td>
    `;
    els.domainTableBody.appendChild(tr);
  }

  els.domainTableBody.querySelectorAll("[data-domain-open]").forEach(button => {
    button.addEventListener("click", async () => {
      await openDomainOverview(button.getAttribute("data-domain-open"));
    });
  });

  els.domainTableBody.querySelectorAll("[data-domain-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const domainId = button.getAttribute("data-domain-edit");
      const domain = state.domains.find(item => item.domain_id === domainId);
      if (domain) openDomainModal(domain);
    });
  });

  els.domainTableBody.querySelectorAll("[data-domain-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      const domainId = button.getAttribute("data-domain-delete");
      const domain = state.domains.find(item => item.domain_id === domainId);
      if (window.confirm(t("confirm.deleteDomain", { label: domain?.name || domainId }))) {
        await deleteDomain(domainId);
      }
    });
  });
  renderPagination("domains", state.filteredDomains.length, els.domainPagination);
}

function domainExtensionCount(domain) {
  if (state.extensionCounts.has(domain.domain_id)) return state.extensionCounts.get(domain.domain_id);
  if (state.selectedDomainId === domain.domain_id && state.extensions.length > 0) return state.extensions.length;
  if (Array.isArray(domain.extensions)) return domain.extensions.length;
  return Number(domain.extension_count || 0);
}

function endpointText(host, port) {
  return host ? `${host}:${port || 5060}` : "-";
}

function proxyText(row) {
  return row.outbound_proxy_host
    ? endpointText(row.outbound_proxy_host, row.outbound_proxy_port || row.server_port)
    : "-";
}

function trunkHealthFor(type, id) {
  return state.trunkHealth.get(`${type}:${id}`);
}

function trunkRegistrationFor(trunkId, accountId) {
  return state.trunkRegistrations.get(`reg:${trunkId}/${accountId}`);
}

function runtimeReasonText(item) {
  if (item?.response_code) return `SIP ${item.response_code}`;
  const reason = String(item?.reason || "").toLowerCase();
  if (!reason) {
    return state.trunkMirrorReady ? t("trunkRuntime.noState") : t("trunkRuntime.waiting");
  }
  if (reason === "options_start_rejected:-6") return t("trunkRuntime.resolveFailed");
  if (reason.startsWith("options_start_rejected:")) return t("trunkRuntime.probeFailed");
  if (reason.includes("rejected options start: -6")) return t("trunkRuntime.resolveFailed");
  if (reason.includes("rejected options start")) return t("trunkRuntime.probeFailed");
  if (reason.includes("rejected register start: -6")) return t("trunkRuntime.resolveFailed");
  if (reason.includes("rejected register start")) return t("trunkRuntime.registerStartFailed");
  const known = {
    response_successful: "trunkRuntime.responseSuccessful",
    transaction_timeout: "trunkRuntime.timeout",
    network_error: "trunkRuntime.networkError",
    local_failure: "trunkRuntime.localFailure",
    response_request_failure: "trunkRuntime.remoteRejected"
  };
  return known[reason] ? t(known[reason]) : t("trunkRuntime.operationFailed");
}

function runtimeStatusBlock(item, enabled, kind) {
  const runtimeState = enabled ? String(item?.state || "unknown").toLowerCase() : "disabled";
  const labelKey = kind === "health"
    ? `trunkHealth.${runtimeState}`
    : `trunkRegistration.${runtimeState}`;
  const response = runtimeReasonText(item);
  return `
    <div class="runtime-status" title="${escapeHtml(response)}">
      <span class="chip ${escapeHtml(runtimeState)}">${escapeHtml(t(labelKey))}</span>
      <span class="runtime-status__meta">${escapeHtml(response)}</span>
    </div>
  `;
}

function formatTrunkExpires(value) {
  if (!value) return "-";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatRemaining(value) {
  if (!value) return t("trunkRuntime.noExpiry");
  const seconds = Math.ceil((Number(value) - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return t("trunkRuntime.noExpiry");
  if (seconds <= 0) return t("trunkRuntime.expired");
  if (seconds < 60) return t("trunkRuntime.remainingSeconds", { count: seconds });
  if (seconds < 3600) return t("trunkRuntime.remainingMinutes", { count: Math.ceil(seconds / 60) });
  return t("trunkRuntime.remainingHours", { count: Math.ceil(seconds / 3600) });
}

function trunkOptionLabel(ref) {
  return state.trunkOptions.find(option => option.value === ref)?.label || ref || t("inboundRouteForm.anyTrunk");
}

function routePatterns(route) {
  const source = route.src_pattern ? `${t("routes.sourceShort")} ${route.src_pattern}` : `${t("routes.sourceShort")} *`;
  return `${t("routes.destinationShort")} ${route.dst_pattern} · ${source}`;
}

function transformText(strip, prefix, suffix) {
  const parts = [];
  if (Number(strip) > 0) parts.push(t("routes.transformStrip", { count: strip }));
  if (prefix) parts.push(t("routes.transformPrefix", { value: prefix }));
  if (suffix) parts.push(t("routes.transformSuffix", { value: suffix }));
  return parts.length > 0 ? parts.join(" ") : t("routes.transformNone");
}

function routeTransforms(route) {
  return `${t("routes.destinationShort")} ${transformText(route.dst_strip, route.dst_prefix, route.dst_suffix)} · ${t("routes.sourceShort")} ${transformText(route.src_strip, route.src_prefix, route.src_suffix)}`;
}

function rebuildTrunkOptions(peerTrunks, regTrunks, regAccounts) {
  state.regTrunkOptions = regTrunks;
  const options = peerTrunks
    .filter(trunk => trunk.enabled)
    .map(trunk => ({
      value: `peer:${trunk.id}`,
      label: trunk.name
    }));
  for (const account of regAccounts.filter(account => account.enabled)) {
    const trunk = regTrunks.find(item => item.id === account.reg_trunk_id && item.enabled);
    if (!trunk) continue;
    options.push({
      value: `reg:${trunk.id}/${account.id}`,
      label: `${trunk.name} · ${account.auth_name}`
    });
  }
  state.trunkOptions = options;
  renderRouteTrunkCandidateSelect();
  renderInboundRouteSelects();
  renderRegAccountTrunkSelect();
}

function renderRouteTrunkCandidateSelect() {
  const available = state.trunkOptions.filter(option => !state.routeTrunkRefs.includes(option.value));
  els.routeTrunkCandidateInput.innerHTML = available
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  els.addRouteTrunkButton.disabled = available.length === 0;
}

function renderRouteTrunkRefs() {
  els.routeTrunkRefsList.innerHTML = "";
  if (state.routeTrunkRefs.length === 0) {
    els.routeTrunkRefsList.innerHTML = `<div class="route-ref-empty">${escapeHtml(t("routeForm.noTrunks"))}</div>`;
  }
  state.routeTrunkRefs.forEach((ref, index) => {
    const row = document.createElement("div");
    row.className = "route-ref-row";
    row.innerHTML = `
      <span class="route-ref-position">${escapeHtml(index + 1)}</span>
      <span class="route-ref-label">${escapeHtml(trunkOptionLabel(ref))}</span>
      <div class="route-ref-actions">
        <button class="icon-button" type="button" data-route-ref-up="${escapeHtml(index)}" ${index === 0 ? "disabled" : ""} aria-label="${escapeHtml(t("actions.moveUp"))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
        </button>
        <button class="icon-button" type="button" data-route-ref-down="${escapeHtml(index)}" ${index === state.routeTrunkRefs.length - 1 ? "disabled" : ""} aria-label="${escapeHtml(t("actions.moveDown"))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <button class="icon-button" type="button" data-route-ref-remove="${escapeHtml(index)}" aria-label="${escapeHtml(t("actions.remove"))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>
      </div>
    `;
    els.routeTrunkRefsList.appendChild(row);
  });
  renderRouteTrunkCandidateSelect();
}

function addRouteTrunkRef() {
  const ref = els.routeTrunkCandidateInput.value;
  if (!ref || state.routeTrunkRefs.includes(ref)) return;
  state.routeTrunkRefs.push(ref);
  renderRouteTrunkRefs();
}

function moveRouteTrunkRef(index, offset) {
  const target = index + offset;
  if (index < 0 || target < 0 || index >= state.routeTrunkRefs.length || target >= state.routeTrunkRefs.length) return;
  const [ref] = state.routeTrunkRefs.splice(index, 1);
  state.routeTrunkRefs.splice(target, 0, ref);
  renderRouteTrunkRefs();
}

function renderInboundRouteSelects() {
  const currentMatch = els.inboundRouteTrunkMatchInput.value;
  els.inboundRouteTrunkMatchInput.innerHTML = [
    `<option value="">${escapeHtml(t("inboundRouteForm.anyTrunk"))}</option>`,
    ...state.trunkOptions.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
  ].join("");
  ensureSelectOption(els.inboundRouteTrunkMatchInput, currentMatch, trunkOptionLabel(currentMatch));
  els.inboundRouteTrunkMatchInput.value = currentMatch;

  const currentTarget = els.inboundRouteTargetInput.value;
  const targets = [
    { value: "auto", label: t("inboundRouteForm.targetAuto") },
    { value: "rej", label: t("inboundRouteForm.targetReject") },
    ...state.extensionOptions
      .filter(extension => extension.enabled)
      .map(extension => ({ value: `ext-${extension.number}`, label: `${extension.number} · ${extension.auth_user}` })),
    ...state.aiAgents
      .filter(agent => agent.enabled)
      .map(agent => ({ value: `ai_agent:${agent.agent_id}`, label: `${agent.service_number} · ${agent.name} · AI` }))
  ];
  els.inboundRouteTargetInput.innerHTML = targets
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
  ensureSelectOption(els.inboundRouteTargetInput, currentTarget, currentTarget);
  els.inboundRouteTargetInput.value = currentTarget || "auto";
}

function renderRegAccountTrunkSelect() {
  const current = els.regAccountTrunkIdInput.value;
  els.regAccountTrunkIdInput.innerHTML = state.regTrunks
    .concat(state.regTrunkOptions.filter(option => !state.regTrunks.some(trunk => trunk.id === option.id)))
    .filter(trunk => trunk.enabled)
    .map(trunk => `<option value="${escapeHtml(trunk.id)}">${escapeHtml(trunk.name)}</option>`)
    .join("");
  ensureSelectOption(els.regAccountTrunkIdInput, current, current);
  if (current) els.regAccountTrunkIdInput.value = current;
}

function ensureSelectOption(select, value, label) {
  if (!value || Array.from(select.options).some(option => option.value === String(value))) return;
  const option = document.createElement("option");
  option.value = String(value);
  option.textContent = label || String(value);
  select.appendChild(option);
}

function renderExtensions() {
  const pageExtensions = pageRows("extensions", state.extensions);
  els.extensionTableBody.innerHTML = "";
  els.extensionEmptyState.hidden = state.extensions.length > 0;
  for (const extension of pageExtensions) {
    const registration = registrationFor(extension);
    const regState = normalizedRegistration(extension);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(extension.number)}</td>
      <td>${escapeHtml(extension.auth_user)}</td>
      <td><span class="chip ${extension.enabled ? "enabled" : "off"}">${escapeHtml(extension.enabled ? t("state.enabled") : t("state.disabled"))}</span></td>
      <td><span class="chip ${escapeHtml(regState)}">${escapeHtml(t(`state.${regState}`))}</span></td>
      <td class="table-date">${escapeHtml(formatExpires(registration?.expires_at_ms))}</td>
      <td class="table-agent">${escapeHtml(registration?.user_agent || registration?.agent || "-")}</td>
      <td class="table-contact">${escapeHtml(registration?.contact || "-")}</td>
      <td class="actions-column">
        <div class="row-actions">
          <button class="icon-button" type="button" data-extension-edit="${escapeHtml(extension.id)}" aria-label="${escapeHtml(t("actions.edit"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-button" type="button" data-extension-delete="${escapeHtml(extension.id)}" aria-label="${escapeHtml(t("actions.delete"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    els.extensionTableBody.appendChild(tr);
  }

  els.extensionTableBody.querySelectorAll("[data-extension-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const id = Number(button.getAttribute("data-extension-edit"));
      const ext = state.extensions.find(item => item.id === id);
      if (!ext) return;
      openEditor("extensions", ext);
    });
  });

  els.extensionTableBody.querySelectorAll("[data-extension-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-extension-delete"));
      const ext = state.extensions.find(item => item.id === id);
      if (!ext) return;
      if (window.confirm(t("confirm.deleteExtension", { number: ext.number }))) {
        await deleteExtension(ext);
      }
    });
  });
  renderPagination("extensions", state.extensions.length, els.extensionPagination);
}

function renderTrunks() {
  const pageTrunks = pageRows("trunks", state.trunks);
  els.peerTrunkTabCount.textContent = Number(state.pagination.trunks?.total ?? state.trunks.length);
  els.trunkTableBody.innerHTML = "";
  els.trunkEmptyState.hidden = state.trunks.length > 0;
  for (const trunk of pageTrunks) {
    const health = trunkHealthFor("peer", trunk.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(trunk.id)}</td>
      <td>${escapeHtml(trunk.name)}</td>
      <td class="mono">${escapeHtml(endpointText(trunk.server_host, trunk.server_port))}</td>
      <td class="mono">${escapeHtml(proxyText(trunk))}</td>
      <td class="mono">${escapeHtml(String(trunk.transport || "udp").toUpperCase())}</td>
      <td class="mono">${escapeHtml(trunk.keep_alive_seconds ?? 60)}s</td>
      <td>${runtimeStatusBlock(health, trunk.enabled, "health")}</td>
      <td class="actions-column">
        <div class="row-actions">
          <button class="icon-button" type="button" data-trunk-edit="${escapeHtml(trunk.id)}" aria-label="${escapeHtml(t("actions.edit"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-button" type="button" data-trunk-delete="${escapeHtml(trunk.id)}" aria-label="${escapeHtml(t("actions.delete"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    els.trunkTableBody.appendChild(tr);
  }

  els.trunkTableBody.querySelectorAll("[data-trunk-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const id = Number(button.getAttribute("data-trunk-edit"));
      const trunk = state.trunks.find(item => item.id === id);
      if (!trunk) return;
      openEditor("trunks", trunk);
    });
  });

  els.trunkTableBody.querySelectorAll("[data-trunk-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-trunk-delete"));
      if (window.confirm(t("confirm.deleteTrunk", { id }))) {
        await deleteTrunk(id);
      }
    });
  });
  renderPagination("trunks", state.trunks.length, els.trunkPagination);
}

function renderRoutes() {
  const pageRoutes = pageRows("routes", state.routes);
  els.outboundRouteTabCount.textContent = Number(state.pagination.routes?.total ?? state.routes.length);
  els.routeTableBody.innerHTML = "";
  els.routeEmptyState.hidden = state.routes.length > 0;
  for (const route of pageRoutes) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(route.id)}</td>
      <td class="mono">${escapeHtml(route.priority ?? 100)}</td>
      <td>${escapeHtml(route.name)}</td>
      <td class="table-wrap">${escapeHtml(routePatterns(route))}</td>
      <td class="table-wrap">${escapeHtml(routeTransforms(route))}</td>
      <td class="table-wrap">${escapeHtml((route.trunk_refs || []).map(trunkOptionLabel).join(" → ") || "-")}</td>
      <td><span class="chip ${route.enabled ? "enabled" : "off"}">${escapeHtml(route.enabled ? t("state.enabled") : t("state.disabled"))}</span></td>
      <td class="actions-column">
        <div class="row-actions">
          <button class="icon-button" type="button" data-route-edit="${escapeHtml(route.id)}" aria-label="${escapeHtml(t("actions.edit"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-button" type="button" data-route-delete="${escapeHtml(route.id)}" aria-label="${escapeHtml(t("actions.delete"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    els.routeTableBody.appendChild(tr);
  }

  els.routeTableBody.querySelectorAll("[data-route-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const id = Number(button.getAttribute("data-route-edit"));
      const route = state.routes.find(item => item.id === id);
      if (!route) return;
      openEditor("routes", route);
    });
  });

  els.routeTableBody.querySelectorAll("[data-route-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-route-delete"));
      if (window.confirm(t("confirm.deleteRoute", { id }))) {
        await deleteRoute(id);
      }
    });
  });
  renderPagination("routes", state.routes.length, els.routePagination);
}

function actionButtons(kind, id) {
  return `<div class="row-actions">
    <button class="icon-button" type="button" data-${kind}-edit="${escapeHtml(id)}" aria-label="${escapeHtml(t("actions.edit"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
    <button class="icon-button" type="button" data-${kind}-delete="${escapeHtml(id)}" aria-label="${escapeHtml(t("actions.delete"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
  </div>`;
}

function bindResourceActions(kind, rows, editTab, onDelete) {
  document.querySelectorAll(`[data-${kind}-edit]`).forEach(button => {
    button.addEventListener("click", () => {
      const item = rows.find(row => row.id === Number(button.getAttribute(`data-${kind}-edit`)));
      if (item) openEditor(editTab, item);
    });
  });
  document.querySelectorAll(`[data-${kind}-delete]`).forEach(button => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute(`data-${kind}-delete`));
      if (window.confirm(t("confirm.deleteResource", { id }))) await onDelete(id);
    });
  });
}

function renderRegTrunks() {
  els.regTrunkTableBody.innerHTML = "";
  els.regTrunkEmptyState.hidden = state.regTrunks.length > 0;
  els.regTrunkTabCount.textContent = Number(state.pagination.regTrunks?.total ?? state.regTrunks.length);
  for (const trunk of state.regTrunks) {
    const accounts = state.regAccounts.filter(account => account.reg_trunk_id === trunk.id);
    const health = trunkHealthFor("reg", trunk.id);
    const trunkRow = document.createElement("tr");
    trunkRow.className = `trunk-group-row trunk-group-row--${escapeHtml(String(health?.state || "unknown").toLowerCase())}`;
    trunkRow.innerHTML = `
      <td><span class="resource-kind resource-kind--trunk">${escapeHtml(t("regTrunks.kind.trunk"))}</span></td>
      <td>
        <div class="cell-primary">${escapeHtml(trunk.name)}</div>
        <div class="cell-secondary">#${escapeHtml(trunk.id)} · ${escapeHtml(t("regTrunks.accountCount", { count: accounts.length }))}</div>
      </td>
      <td>
        <div class="cell-primary mono">${escapeHtml(endpointText(trunk.server_host, trunk.server_port))}</div>
        <div class="cell-secondary mono">${escapeHtml(t("regTrunks.proxyLine", { proxy: proxyText(trunk) }))}</div>
      </td>
      <td>
        <div class="cell-primary mono">${escapeHtml(String(trunk.transport || "udp").toUpperCase())}</div>
        <div class="cell-secondary">${escapeHtml(t("regTrunks.keepAliveLine", { seconds: trunk.keep_alive_seconds ?? 60 }))}</div>
      </td>
      <td class="mono">${escapeHtml(t("regTrunks.expiresLine", { seconds: trunk.requested_expires_seconds ?? 300 }))}</td>
      <td>${runtimeStatusBlock(health, trunk.enabled, "health")}</td>
      <td class="actions-column">
        <div class="row-actions">
          <button class="icon-button" type="button" data-reg-account-add="${escapeHtml(trunk.id)}" aria-label="${escapeHtml(t("regAccountForm.addForTrunk", { name: trunk.name }))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          </button>
          <button class="icon-button" type="button" data-reg-trunk-edit="${escapeHtml(trunk.id)}" aria-label="${escapeHtml(t("actions.edit"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-button" type="button" data-reg-trunk-delete="${escapeHtml(trunk.id)}" aria-label="${escapeHtml(t("actions.delete"))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>
    `;
    els.regTrunkTableBody.appendChild(trunkRow);

    if (accounts.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.className = "trunk-account-empty-row";
      emptyRow.innerHTML = `
        <td></td>
        <td colspan="5" class="trunk-account-empty">${escapeHtml(t("regAccounts.emptyForTrunk"))}</td>
        <td></td>
      `;
      els.regTrunkTableBody.appendChild(emptyRow);
      continue;
    }

    for (const account of accounts) {
      const registration = trunkRegistrationFor(trunk.id, account.id);
      const accountRow = document.createElement("tr");
      accountRow.className = `trunk-account-row trunk-account-row--${escapeHtml(String(registration?.state || "unknown").toLowerCase())}`;
      accountRow.innerHTML = `
        <td><span class="resource-kind resource-kind--account">${escapeHtml(t("regTrunks.kind.account"))}</span></td>
        <td>
          <div class="cell-primary">${escapeHtml(account.auth_name)}</div>
          <div class="cell-secondary">#${escapeHtml(account.id)}</div>
        </td>
        <td>
          <div class="cell-primary mono">${escapeHtml(`reg:${trunk.id}/${account.id}`)}</div>
          <div class="cell-secondary">${escapeHtml(trunk.name)}</div>
        </td>
        <td>
          <div class="cell-primary mono">REGISTER</div>
          <div class="cell-secondary">${escapeHtml(runtimeReasonText(registration))}</div>
        </td>
        <td>
          <div class="cell-primary table-date">${escapeHtml(formatTrunkExpires(registration?.expires_at_ms))}</div>
          <div class="cell-secondary">${escapeHtml(formatRemaining(registration?.expires_at_ms))}</div>
        </td>
        <td>${runtimeStatusBlock(registration, account.enabled && trunk.enabled, "registration")}</td>
        <td class="actions-column">${actionButtons("reg-account", account.id)}</td>
      `;
      els.regTrunkTableBody.appendChild(accountRow);
    }
  }
  els.regTrunkTableBody.querySelectorAll("[data-reg-account-add]").forEach(button => {
    button.addEventListener("click", () => openRegAccountForTrunk(Number(button.getAttribute("data-reg-account-add"))));
  });
  bindResourceActions("reg-trunk", state.regTrunks, "regTrunks", deleteRegTrunk);
  bindResourceActions("reg-account", state.regAccounts, "regAccounts", deleteRegAccount);
  renderPagination("regTrunks", state.regTrunks.length, els.regTrunkPagination);
}

function renderInboundRoutes() {
  els.inboundRouteTabCount.textContent = Number(state.pagination.inboundRoutes?.total ?? state.inboundRoutes.length);
  els.inboundRouteTableBody.innerHTML = "";
  els.inboundRouteEmptyState.hidden = state.inboundRoutes.length > 0;
  for (const route of state.inboundRoutes) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="mono">${escapeHtml(route.id)}</td><td class="mono">${escapeHtml(route.priority ?? 100)}</td><td>${escapeHtml(route.name)}</td><td>${escapeHtml(trunkOptionLabel(route.trunk_match))}</td><td class="table-wrap">${escapeHtml(routePatterns(route))}</td><td>${escapeHtml(route.target)}</td><td><span class="chip ${route.enabled ? "enabled" : "off"}">${escapeHtml(route.enabled ? t("state.enabled") : t("state.disabled"))}</span></td><td class="actions-column">${actionButtons("inbound-route", route.id)}</td>`;
    els.inboundRouteTableBody.appendChild(tr);
  }
  bindResourceActions("inbound-route", state.inboundRoutes, "inboundRoutes", deleteInboundRoute);
  renderPagination("inboundRoutes", state.inboundRoutes.length, els.inboundRoutePagination);
}

function renderAiAgents() {
  els.aiAgentTableBody.innerHTML = "";
  els.aiAgentEmptyState.hidden = state.aiAgents.length > 0;
  for (const agent of state.aiAgents) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="mono">${escapeHtml(agent.service_number)}</td><td>${escapeHtml(agent.name)}</td><td class="mono">${escapeHtml(agent.agent_id)}</td><td class="mono">${escapeHtml(agent.profile_id)}</td><td><span class="chip ${agent.enabled ? "enabled" : "off"}">${escapeHtml(agent.enabled ? t("state.enabled") : t("state.disabled"))}</span></td><td class="actions-column">${actionButtons("ai-agent", agent.id)}</td>`;
    els.aiAgentTableBody.appendChild(tr);
  }
  bindResourceActions("ai-agent", state.aiAgents, "aiAgents", deleteAiAgent);
  renderPagination("aiAgents", state.aiAgents.length, els.aiAgentPagination);
}

function renderMirror() {
  els.mirrorList.innerHTML = "";
  els.mirrorHint.textContent = state.mirrorReady ? t("mirror.ready") : t("mirror.notReady");
  if (state.extensions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("mirror.empty");
    els.mirrorList.appendChild(empty);
    return;
  }
  for (const extension of state.extensions) {
    const registration = registrationFor(extension);
    const regState = normalizedRegistration(extension);
    const item = document.createElement("div");
    item.className = "mirror-item";
    item.innerHTML = `
      <div>
        <div class="mirror-item__number">${escapeHtml(extension.number)}</div>
        <div class="mirror-item__contact">${escapeHtml(registration?.contact || registration?.source || "-")}</div>
      </div>
      <span class="chip ${escapeHtml(regState)}">${escapeHtml(t(`state.${regState}`))}</span>
    `;
    els.mirrorList.appendChild(item);
  }
}

function registrationFor(extension) {
  const domainId = extension.domain_id || state.selectedDomainId;
  return findRegistration(state.registrations, domainId, extension);
}

function normalizedRegistration(extension) {
  const registration = registrationFor(extension);
  return String(registration?.state || extension.registration_state || "unknown").toLowerCase();
}

function formatExpires(value) {
  if (!value) return "-";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function resetExtensionForm() {
  els.extensionForm.reset();
  state.editingExtensionId = null;
  els.extNumberInput.disabled = false;
  els.extEnabledInput.checked = true;
  resetPasswordVisibility(els.extPasswordInput, els.toggleExtPasswordButton);
}

function resetExtensionBatchForm() {
  els.extensionBatchForm.reset();
  els.batchCountInput.value = "10";
  els.batchEnabledInput.checked = true;
  resetPasswordVisibility(els.batchPasswordInput, els.toggleBatchPasswordButton);
}

function resetTrunkForm() {
  els.trunkForm.reset();
  state.editingPeerTrunkId = null;
  els.trunkServerPortInput.value = "5060";
  els.trunkKeepAliveInput.value = "60";
  els.trunkEnabledInput.checked = true;
}

function resetRouteForm() {
  els.routeForm.reset();
  state.editingOutboundRouteId = null;
  state.routeTrunkRefs = [];
  els.routePriorityInput.value = "100";
  els.routeDstStripInput.value = "0";
  els.routeSrcStripInput.value = "0";
  els.routeEnabledInput.checked = true;
  renderRouteTrunkRefs();
}

function resetRegTrunkForm() { els.regTrunkForm.reset(); state.editingRegTrunkId = null; els.regTrunkServerPortInput.value = "5060"; els.regTrunkKeepAliveInput.value = "60"; els.regTrunkExpiresInput.value = "300"; els.regTrunkEnabledInput.checked = true; }
function resetRegAccountForm() {
  els.regAccountForm.reset();
  state.editingRegAccountId = null;
  els.regAccountEnabledInput.checked = true;
  resetPasswordVisibility(els.regAccountPasswordInput, els.toggleRegAccountPasswordButton);
}
function resetInboundRouteForm() {
  els.inboundRouteForm.reset();
  state.editingInboundRouteId = null;
  els.inboundRoutePriorityInput.value = "100";
  els.inboundRouteDstStripInput.value = "0";
  els.inboundRouteSrcStripInput.value = "0";
  els.inboundRouteEnabledInput.checked = true;
  renderInboundRouteSelects();
}

function resetAiAgentForm() {
  els.aiAgentForm.reset();
  state.editingAiAgentId = null;
  els.aiAgentEnabledInput.checked = true;
  els.aiAgentIdInput.disabled = false;
  els.aiAgentServiceNumberInput.disabled = false;
  renderAiAgentProfileSelect();
}

function openRegAccountForTrunk(trunkId) {
  openEditor("regAccounts");
  const trunk = state.regTrunkOptions.find(item => item.id === trunkId);
  ensureSelectOption(els.regAccountTrunkIdInput, trunkId, trunk?.name);
  els.regAccountTrunkIdInput.value = String(trunkId);
  els.regAccountPasswordInput.required = true;
}

function openEditor(tab, item = null) {
  setDetailTab(tab);
  setFormMessage("");
  if (tab === "extensions") {
    resetExtensionForm();
    state.editingExtensionId = item?.id ?? null;
    els.extNumberInput.value = item?.number || "";
    els.extNumberInput.disabled = Boolean(item);
    els.extAuthUserInput.value = item?.auth_user || "";
    els.extPasswordInput.value = item?.password || "";
    els.extEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.extNumberInput.focus(), 0);
  } else if (tab === "extensionBatch") {
    resetExtensionBatchForm();
    window.setTimeout(() => els.batchStartInput.focus(), 0);
  } else if (tab === "trunks") {
    resetTrunkForm();
    state.editingPeerTrunkId = item?.id ?? null;
    els.trunkNameInput.value = item?.name || "";
    els.trunkServerHostInput.value = item?.server_host || "";
    els.trunkServerPortInput.value = item?.server_port || 5060;
    els.trunkProxyHostInput.value = item?.outbound_proxy_host || "";
    els.trunkProxyPortInput.value = item?.outbound_proxy_port || "";
    els.trunkTransportInput.value = item?.transport || "udp";
    els.trunkKeepAliveInput.value = item?.keep_alive_seconds ?? 60;
    els.trunkEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.trunkNameInput.focus(), 0);
  } else if (tab === "routes") {
    resetRouteForm();
    state.editingOutboundRouteId = item?.id ?? null;
    els.routeNameInput.value = item?.name || "";
    els.routeDstPatternInput.value = item?.dst_pattern || "";
    els.routeSrcPatternInput.value = item?.src_pattern || "";
    els.routePriorityInput.value = item?.priority ?? 100;
    els.routeDstStripInput.value = item?.dst_strip ?? 0;
    els.routeDstPrefixInput.value = item?.dst_prefix || "";
    els.routeDstSuffixInput.value = item?.dst_suffix || "";
    els.routeSrcStripInput.value = item?.src_strip ?? 0;
    els.routeSrcPrefixInput.value = item?.src_prefix || "";
    els.routeSrcSuffixInput.value = item?.src_suffix || "";
    state.routeTrunkRefs = [...(item?.trunk_refs || [])];
    renderRouteTrunkRefs();
    els.routeEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.routeNameInput.focus(), 0);
  } else if (tab === "regTrunks") {
    resetRegTrunkForm(); state.editingRegTrunkId = item?.id ?? null;
    els.regTrunkNameInput.value = item?.name || ""; els.regTrunkServerHostInput.value = item?.server_host || ""; els.regTrunkServerPortInput.value = item?.server_port || 5060; els.regTrunkProxyHostInput.value = item?.outbound_proxy_host || ""; els.regTrunkProxyPortInput.value = item?.outbound_proxy_port || ""; els.regTrunkTransportInput.value = item?.transport || "udp"; els.regTrunkKeepAliveInput.value = item?.keep_alive_seconds ?? 60; els.regTrunkExpiresInput.value = item?.requested_expires_seconds || 300; els.regTrunkEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.regTrunkNameInput.focus(), 0);
  } else if (tab === "regAccounts") {
    resetRegAccountForm(); state.editingRegAccountId = item?.id ?? null;
    ensureSelectOption(els.regAccountTrunkIdInput, item?.reg_trunk_id, state.regTrunkOptions.find(trunk => trunk.id === item?.reg_trunk_id)?.name);
    els.regAccountTrunkIdInput.value = item?.reg_trunk_id || ""; els.regAccountAuthNameInput.value = item?.auth_name || ""; els.regAccountPasswordInput.value = item?.auth_pwd || ""; els.regAccountPasswordInput.required = true; els.regAccountEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.regAccountTrunkIdInput.focus(), 0);
  } else if (tab === "inboundRoutes") {
    resetInboundRouteForm(); state.editingInboundRouteId = item?.id ?? null;
    ensureSelectOption(els.inboundRouteTrunkMatchInput, item?.trunk_match, trunkOptionLabel(item?.trunk_match));
    ensureSelectOption(els.inboundRouteTargetInput, item?.target, item?.target);
    els.inboundRouteNameInput.value = item?.name || ""; els.inboundRouteTrunkMatchInput.value = item?.trunk_match || ""; els.inboundRouteDstPatternInput.value = item?.dst_pattern || ""; els.inboundRouteSrcPatternInput.value = item?.src_pattern || ""; els.inboundRouteTargetInput.value = item?.target || "auto"; els.inboundRoutePriorityInput.value = item?.priority ?? 100; els.inboundRouteDstStripInput.value = item?.dst_strip ?? 0; els.inboundRouteDstPrefixInput.value = item?.dst_prefix || ""; els.inboundRouteDstSuffixInput.value = item?.dst_suffix || ""; els.inboundRouteSrcStripInput.value = item?.src_strip ?? 0; els.inboundRouteSrcPrefixInput.value = item?.src_prefix || ""; els.inboundRouteSrcSuffixInput.value = item?.src_suffix || ""; els.inboundRouteEnabledInput.checked = item?.enabled ?? true;
    window.setTimeout(() => els.inboundRouteNameInput.focus(), 0);
  } else if (tab === "aiAgents") {
    resetAiAgentForm(); state.editingAiAgentId = item?.id ?? null;
    els.aiAgentIdInput.value = item?.agent_id || "";
    els.aiAgentNameInput.value = item?.name || "";
    els.aiAgentServiceNumberInput.value = item?.service_number || "";
    els.aiAgentFallbackTargetInput.value = item?.fallback_target || "";
    renderAiAgentProfileSelect();
    els.aiAgentProfileInput.value = item?.profile_id || "";
    els.aiAgentEnabledInput.checked = item?.enabled ?? true;
    els.aiAgentIdInput.disabled = Boolean(item);
    els.aiAgentServiceNumberInput.disabled = Boolean(item);
    window.setTimeout(() => els.aiAgentNameInput.focus(), 0);
  }
  els.detailSide.classList.add("editor-open");
}

function resetPasswordVisibility(input, button) {
  input.type = "password";
  button?.classList.remove("is-revealed");
  button?.setAttribute("aria-label", t("actions.showPassword"));
}

function togglePassword(input, button) {
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  button?.classList.toggle("is-revealed", reveal);
  button?.setAttribute("aria-label", t(reveal ? "actions.hidePassword" : "actions.showPassword"));
  input.focus();
}

function closeEditor() {
  els.detailSide.classList.remove("editor-open");
  setFormMessage("");
}

function openDomainModal(domain = null) {
  els.domainModalForm.reset();
  els.domainModalHiddenId.value = domain?.domain_id || "";
  els.domainModalNameInput.value = domain?.name || "";
  els.domainModalRealmInput.value = domain?.realm || "";
  els.domainModalPasswordInput.value = domain?.password || "";
  els.domainModalRemarkInput.value = domain?.remark || "";
  resetPasswordVisibility(els.domainModalPasswordInput, els.toggleDomainPasswordButton);
  els.domainModal.showModal();
}

function closeDomainModal() {
  els.domainModal.close();
}

async function loadStatus() {
  try {
    const result = await api("/api/status");
    state.status = kvItems(result);
    updateSidebarStatus(true);
    els.sidebarConfigVersion.textContent = state.status.runtime_config_version ?? "-";
    els.sidebarAdapterCount.textContent = state.status.adapter_clients ?? 0;
    els.statusService.textContent = state.status.service || "-";
    els.statusInstance.textContent = state.status.instance_id || "-";
    els.statusVersion.textContent = state.status.runtime_config_version ?? "-";
    els.statusResources.textContent = Array.isArray(state.status.config_resources)
      ? state.status.config_resources.join(", ")
      : "-";
    systemView?.recordStatus(state.status);
    renderStatusSummary();
    return state.status;
  } catch (error) {
    updateSidebarStatus(false);
    els.sidebarConfigVersion.textContent = "-";
    els.sidebarAdapterCount.textContent = "0";
    els.statusService.textContent = t("state.disconnected");
    els.statusInstance.textContent = "-";
    els.statusVersion.textContent = "-";
    els.statusResources.textContent = error.message;
    throw error;
  }
}

async function loadDomains() {
  const result = await api(`/api/domains?${pageQuery("domains")}`);
  const data = commandData(result);
  state.domains = data.domains || [];
  state.pagination.domains = data.pagination || null;
  usersView?.setDomains(state.domains);
  if (state.selectedDomainId) {
    state.selectedDomain = state.domains.find(domain => domain.domain_id === state.selectedDomainId) || null;
    if (!state.selectedDomain) {
      state.selectedDomainId = null;
    }
  }
  renderDomainContext();
  renderStatusSummary();
  renderQuickDomains();
  renderDomainTable();
}

async function loadRegistrations(domainId) {
  const path = domainId
    ? `/api/registrations?domain=${encodeURIComponent(domainId)}`
    : "/api/registrations";
  const result = await api(path);
  const data = commandData(result);
  state.mirrorReady = Boolean(data.mirror_ready);
  if (!domainId) {
    state.registrations = new Map();
    state.registrationCounts = new Map();
  } else {
    for (const key of Array.from(state.registrations.keys())) {
      if (key.startsWith(`${domainId}:`)) state.registrations.delete(key);
    }
    state.registrationCounts.delete(domainId);
  }
  const grouped = new Map();
  for (const item of data.registrations || []) {
    indexRegistration(state.registrations, item);
    if (!grouped.has(item.domain_id)) grouped.set(item.domain_id, []);
    grouped.get(item.domain_id).push(item);
  }
  for (const [id, items] of grouped.entries()) {
    state.registrationCounts.set(
      id,
      items.filter(item => String(item.state || "").toLowerCase() === "registered").length
    );
  }
  renderStatusSummary();
  renderDomainTable();
  renderExtensions();
  renderMirror();
}

async function loadTrunkStatus(domainId) {
  const result = await api(`/api/trunk-status?domain=${encodeURIComponent(domainId)}`);
  const data = commandData(result);
  state.trunkMirrorReady = Boolean(data.mirror_ready);
  state.trunkRegistrations = new Map(
    (data.registrations || []).map(item => [item.trunk_ref, item])
  );
  state.trunkHealth = new Map(
    (data.health || []).map(item => [item.trunk_ref, item])
  );
  renderTrunks();
  renderRegTrunks();
}

async function loadExtensions(domainId) {
  const result = await api(`/api/extensions?domain=${encodeURIComponent(domainId)}&${pageQuery("extensions")}`);
  const data = commandData(result);
  state.extensions = data.extensions || [];
  state.pagination.extensions = data.pagination || null;
  const total = Number(state.pagination.extensions?.total ?? state.extensions.length);
  state.extensionCounts.set(domainId, total);
  renderStatusSummary();
  renderDomainTable();
  renderExtensions();
  renderMirror();
}

async function loadTrunks(domainId) {
  await Promise.all([
    loadPeerTrunks(domainId),
    loadRegTrunks(domainId),
    loadTrunkOptions(domainId)
  ]);
}

async function loadRoutes(domainId) {
  await Promise.all([
    loadOutboundRoutes(domainId),
    loadInboundRoutes(domainId),
    loadExtensionOptions(domainId)
  ]);
}

async function loadPeerTrunks(domainId) {
  const data = commandData(await api(`/api/trunks?domain=${encodeURIComponent(domainId)}&${pageQuery("trunks")}`));
  state.trunks = data.peer_trunks || [];
  state.pagination.trunks = data.pagination || null;
  renderTrunks();
}

async function loadRegTrunks(domainId) {
  const data = commandData(await api(`/api/reg-trunks?domain=${encodeURIComponent(domainId)}&${pageQuery("regTrunks")}`));
  state.regTrunks = data.reg_trunks || [];
  state.pagination.regTrunks = data.pagination || null;
  renderRegTrunks();
  renderRegAccountTrunkSelect();
}

async function loadTrunkOptions(domainId) {
  const query = fixedPageQuery();
  const [peerResult, regTrunkResult, regAccountResult] = await Promise.all([
    api(`/api/trunks?domain=${encodeURIComponent(domainId)}&${query}`),
    api(`/api/reg-trunks?domain=${encodeURIComponent(domainId)}&${query}`),
    api(`/api/reg-accounts?domain=${encodeURIComponent(domainId)}&${query}`)
  ]);
  const peerTrunks = commandData(peerResult).peer_trunks || [];
  const regTrunks = commandData(regTrunkResult).reg_trunks || [];
  const regAccounts = commandData(regAccountResult).reg_accounts || [];
  state.regAccounts = regAccounts;
  rebuildTrunkOptions(peerTrunks, regTrunks, regAccounts);
  renderRoutes();
  renderInboundRoutes();
  renderRegTrunks();
}

async function loadOutboundRoutes(domainId) {
  const data = commandData(await api(`/api/routes?domain=${encodeURIComponent(domainId)}&${pageQuery("routes")}`));
  state.routes = data.outbound_routes || [];
  state.pagination.routes = data.pagination || null;
  renderRoutes();
}

async function loadInboundRoutes(domainId) {
  const data = commandData(await api(`/api/inbound-routes?domain=${encodeURIComponent(domainId)}&${pageQuery("inboundRoutes")}`));
  state.inboundRoutes = data.inbound_routes || [];
  state.pagination.inboundRoutes = data.pagination || null;
  renderInboundRoutes();
}

async function loadAiAgents(domainId) {
  const data = commandData(await api(`/api/ai-agents?domain=${encodeURIComponent(domainId)}&${pageQuery("aiAgents")}`));
  state.aiAgents = data.ai_agents || [];
  state.pagination.aiAgents = data.pagination || null;
  renderAiAgents();
  renderInboundRouteSelects();
}

async function loadAiProfiles() {
  try {
    const data = commandData(await api("/api/ai-profiles"));
    state.aiProfiles = data.profiles || data.ai_profiles || [];
  } catch (_) {
    state.aiProfiles = [];
  }
  renderAiAgentProfileSelect();
}

function renderAiAgentProfileSelect() {
  const current = els.aiAgentProfileInput.value;
  const profiles = state.aiProfiles.filter(item => item.enabled !== false && (item.executable !== false));
  els.aiAgentProfileInput.innerHTML = profiles.map(item => {
    const profile = item.profile || item;
    const id = profile.profile_id || item.profile_id;
    return `<option value="${escapeHtml(id)}">${escapeHtml(id)}${profile.profile_version ? ` · v${escapeHtml(profile.profile_version)}` : ""}</option>`;
  }).join("");
  ensureSelectOption(els.aiAgentProfileInput, current, current);
  if (current) els.aiAgentProfileInput.value = current;
}

async function loadExtensionOptions(domainId) {
  const data = commandData(await api(`/api/extensions?domain=${encodeURIComponent(domainId)}&${fixedPageQuery()}`));
  state.extensionOptions = data.extensions || [];
  renderInboundRouteSelects();
}

function renderDomainContext() {
  const current = state.selectedDomainId;
  els.domainContextSelect.innerHTML = state.domains
    .map(domain => `<option value="${escapeHtml(domain.domain_id)}">${escapeHtml(domain.name || domain.domain_id)}</option>`)
    .join("");
  if (current) els.domainContextSelect.value = current;
  els.domainContextSelect.hidden = state.domains.length <= 1;
  els.domainContextName.textContent = state.selectedDomain?.name || state.selectedDomain?.domain_id || "-";
}

function renderDomainOverview() {
  const domain = state.selectedDomain;
  if (!domain) return;
  els.domainOverviewRealm.textContent = domain.realm || "-";
  els.domainOverviewRemark.textContent = domain.remark || "-";
  els.domainOverviewState.textContent = t(domain.enabled ? "state.enabled" : "state.disabled");
  els.domainOverviewState.classList.toggle("ok", Boolean(domain.enabled));
  els.domainOverviewExtensionCount.textContent = Number(state.pagination.extensions?.total ?? state.extensions.length);
  els.domainOverviewRegisteredCount.textContent = Number(state.registrationCounts.get(domain.domain_id) || 0);
  els.domainOverviewTrunkCount.textContent =
    Number(state.pagination.trunks?.total ?? state.trunks.length)
    + Number(state.pagination.regTrunks?.total ?? state.regTrunks.length);
  els.domainOverviewRouteCount.textContent =
    Number(state.pagination.routes?.total ?? state.routes.length)
    + Number(state.pagination.inboundRoutes?.total ?? state.inboundRoutes.length);
}

async function selectDomain(domainId) {
  if (state.selectedDomainId !== domainId) {
    state.pages.extensions = 1;
    state.pages.trunks = 1;
    state.pages.regTrunks = 1;
    state.pages.routes = 1;
    state.pages.inboundRoutes = 1;
  }
  state.selectedDomainId = domainId;
  state.selectedDomain = state.domains.find(domain => domain.domain_id === domainId) || null;
  if (!state.selectedDomain) return false;
  renderDomainContext();
  await Promise.all([
    loadRegistrations(domainId),
    loadTrunkStatus(domainId),
    loadExtensions(domainId),
    loadTrunks(domainId),
    loadRoutes(domainId),
    loadAiAgents(domainId),
    loadAiProfiles()
  ]);
  renderDomainOverview();
  return true;
}

async function openDomainOverview(domainId) {
  if (await selectDomain(domainId)) setView("domainOverview");
}

async function openDomainDetail(domainId, tab = "extensions") {
  if (!(await selectDomain(domainId))) return;
  setDetailTab(tab);
  setView("detail");
}

async function saveDomain(event) {
  event.preventDefault();
  try {
    await api("/api/domains", {
      method: "POST",
      body: JSON.stringify({
        domain_id: els.domainModalHiddenId.value.trim() || null,
        name: els.domainModalNameInput.value.trim(),
        realm: els.domainModalRealmInput.value.trim(),
        password: els.domainModalPasswordInput.value,
        remark: els.domainModalRemarkInput.value.trim(),
        enabled: true
      })
    });
    closeDomainModal();
    await loadDomains();
    setView("domains");
  } catch (error) {
    window.alert(error.message);
  }
}

async function deleteDomain(domainId) {
  await api(`/api/domains/${encodeURIComponent(domainId)}`, {
    method: "DELETE"
  });
  state.registrationCounts.delete(domainId);
  state.extensionCounts.delete(domainId);
  if (state.selectedDomainId === domainId) {
    state.selectedDomainId = null;
    state.selectedDomain = null;
    state.extensions = [];
    state.trunks = [];
    state.regTrunks = [];
    state.regAccounts = [];
    state.routes = [];
    state.inboundRoutes = [];
    state.registrations = new Map();
    state.mirrorReady = false;
    state.trunkRegistrations = new Map();
    state.trunkHealth = new Map();
    state.trunkMirrorReady = false;
    setView("domains");
  }
  await loadDomains();
}

async function saveExtension(event) {
  event.preventDefault();
  if (!state.selectedDomainId) {
    setFormMessage(t("message.selectDomain"), "error");
    return;
  }
  try {
    const payload = {
      auth_user: els.extAuthUserInput.value.trim(),
      enabled: els.extEnabledInput.checked
    };
    if (state.editingExtensionId !== null) {
      if (els.extPasswordInput.value) {
        payload.password = els.extPasswordInput.value;
      }
      await api(`/api/extensions/${encodeURIComponent(state.selectedDomainId)}/${encodeURIComponent(state.editingExtensionId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/extensions", {
        method: "POST",
        body: JSON.stringify({
          domain_id: state.selectedDomainId,
          number: els.extNumberInput.value.trim(),
          password: els.extPasswordInput.value,
          ...payload
        })
      });
    }
    resetExtensionForm();
    await openDomainDetail(state.selectedDomainId);
    await loadDomains();
    closeEditor();
    setFormMessage(t("message.extensionSaved"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function saveExtensionBatch(event) {
  event.preventDefault();
  if (!state.selectedDomainId) {
    setFormMessage(t("message.selectDomain"), "error");
    return;
  }
  try {
    await api("/api/extensions/batch", {
      method: "POST",
      body: JSON.stringify({
        domain_id: state.selectedDomainId,
        start_number: els.batchStartInput.value.trim(),
        count: Number(els.batchCountInput.value),
        password: els.batchPasswordInput.value,
        enabled: els.batchEnabledInput.checked
      })
    });
    resetExtensionBatchForm();
    state.pages.extensions = 1;
    await openDomainDetail(state.selectedDomainId);
    await loadDomains();
    closeEditor();
    setFormMessage(t("message.extensionBatchSaved"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function deleteExtension(extension) {
  if (!state.selectedDomainId) return;
  try {
    await api(`/api/extensions/${encodeURIComponent(state.selectedDomainId)}/${encodeURIComponent(extension.id)}`, {
      method: "DELETE"
    });
    await openDomainDetail(state.selectedDomainId);
    await loadDomains();
    setFormMessage(t("message.extensionDeleted"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function saveTrunk(event) {
  event.preventDefault();
  if (!state.selectedDomainId) {
    setFormMessage(t("message.selectDomain"), "error");
    return;
  }
  try {
    const payload = {
      name: els.trunkNameInput.value.trim(),
      server_host: els.trunkServerHostInput.value.trim(),
      server_port: Number(els.trunkServerPortInput.value),
      outbound_proxy_host: els.trunkProxyHostInput.value.trim(),
      outbound_proxy_port: els.trunkProxyPortInput.value ? Number(els.trunkProxyPortInput.value) : null,
      transport: els.trunkTransportInput.value,
      keep_alive_seconds: Number(els.trunkKeepAliveInput.value),
      enabled: els.trunkEnabledInput.checked
    };
    await api(state.editingPeerTrunkId === null ? "/api/trunks" : `/api/trunks/${encodeURIComponent(state.selectedDomainId)}/${state.editingPeerTrunkId}`, {
      method: state.editingPeerTrunkId === null ? "POST" : "PATCH",
      body: JSON.stringify(state.editingPeerTrunkId === null ? { domain_id: state.selectedDomainId, ...payload } : payload)
    });
    resetTrunkForm();
    await openDomainDetail(state.selectedDomainId);
    closeEditor();
    setFormMessage(t("message.trunkSaved"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function deleteTrunk(id) {
  if (!state.selectedDomainId) return;
  try {
    await api(`/api/trunks/${encodeURIComponent(state.selectedDomainId)}/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    await openDomainDetail(state.selectedDomainId);
    setFormMessage(t("message.trunkDeleted"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function saveRoute(event) {
  event.preventDefault();
  if (!state.selectedDomainId) {
    setFormMessage(t("message.selectDomain"), "error");
    return;
  }
  try {
    if (state.routeTrunkRefs.length === 0) {
      setFormMessage(t("message.routeTrunkRequired"), "error");
      return;
    }
    const payload = {
      name: els.routeNameInput.value.trim(),
      dst_pattern: els.routeDstPatternInput.value.trim(),
      src_pattern: els.routeSrcPatternInput.value.trim(),
      dst_strip: Number(els.routeDstStripInput.value),
      dst_prefix: els.routeDstPrefixInput.value.trim(),
      dst_suffix: els.routeDstSuffixInput.value.trim(),
      src_strip: Number(els.routeSrcStripInput.value),
      src_prefix: els.routeSrcPrefixInput.value.trim(),
      src_suffix: els.routeSrcSuffixInput.value.trim(),
      priority: Number(els.routePriorityInput.value),
      trunk_refs: [...state.routeTrunkRefs],
      enabled: els.routeEnabledInput.checked
    };
    await api(state.editingOutboundRouteId === null ? "/api/routes" : `/api/routes/${encodeURIComponent(state.selectedDomainId)}/${state.editingOutboundRouteId}`, {
      method: state.editingOutboundRouteId === null ? "POST" : "PATCH",
      body: JSON.stringify(state.editingOutboundRouteId === null ? { domain_id: state.selectedDomainId, ...payload } : payload)
    });
    resetRouteForm();
    await openDomainDetail(state.selectedDomainId);
    closeEditor();
    setFormMessage(t("message.routeSaved"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function deleteRoute(id) {
  if (!state.selectedDomainId) return;
  try {
    await api(`/api/routes/${encodeURIComponent(state.selectedDomainId)}/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    await openDomainDetail(state.selectedDomainId);
    setFormMessage(t("message.routeDeleted"), "ok");
  } catch (error) {
    setFormMessage(error.message, "error");
  }
}

async function saveRegTrunk(event) {
  event.preventDefault();
  if (!state.selectedDomainId) return;
  try {
    const payload = {
      name: els.regTrunkNameInput.value.trim(),
      server_host: els.regTrunkServerHostInput.value.trim(),
      server_port: Number(els.regTrunkServerPortInput.value),
      outbound_proxy_host: els.regTrunkProxyHostInput.value.trim(),
      outbound_proxy_port: els.regTrunkProxyPortInput.value ? Number(els.regTrunkProxyPortInput.value) : null,
      transport: els.regTrunkTransportInput.value,
      keep_alive_seconds: Number(els.regTrunkKeepAliveInput.value),
      requested_expires_seconds: Number(els.regTrunkExpiresInput.value),
      enabled: els.regTrunkEnabledInput.checked
    };
    await api(state.editingRegTrunkId === null ? "/api/reg-trunks" : `/api/reg-trunks/${encodeURIComponent(state.selectedDomainId)}/${state.editingRegTrunkId}`, { method: state.editingRegTrunkId === null ? "POST" : "PATCH", body: JSON.stringify(state.editingRegTrunkId === null ? { domain_id: state.selectedDomainId, ...payload } : payload) });
    resetRegTrunkForm(); await openDomainDetail(state.selectedDomainId); closeEditor(); setFormMessage(t("message.regTrunkSaved"), "ok");
  } catch (error) { setFormMessage(error.message, "error"); }
}

async function saveRegAccount(event) {
  event.preventDefault();
  if (!state.selectedDomainId) return;
  try {
    const payload = { reg_trunk_id: Number(els.regAccountTrunkIdInput.value), auth_name: els.regAccountAuthNameInput.value.trim(), auth_pwd: els.regAccountPasswordInput.value, enabled: els.regAccountEnabledInput.checked };
    await api(state.editingRegAccountId === null ? "/api/reg-accounts" : `/api/reg-accounts/${encodeURIComponent(state.selectedDomainId)}/${state.editingRegAccountId}`, { method: state.editingRegAccountId === null ? "POST" : "PATCH", body: JSON.stringify(state.editingRegAccountId === null ? { domain_id: state.selectedDomainId, ...payload } : payload) });
    resetRegAccountForm(); await openDomainDetail(state.selectedDomainId); closeEditor(); setFormMessage(t("message.regAccountSaved"), "ok");
  } catch (error) { setFormMessage(error.message, "error"); }
}

async function saveInboundRoute(event) {
  event.preventDefault();
  if (!state.selectedDomainId) return;
  try {
    const payload = {
      name: els.inboundRouteNameInput.value.trim(),
      trunk_match: els.inboundRouteTrunkMatchInput.value,
      dst_pattern: els.inboundRouteDstPatternInput.value.trim(),
      src_pattern: els.inboundRouteSrcPatternInput.value.trim(),
      dst_strip: Number(els.inboundRouteDstStripInput.value),
      dst_prefix: els.inboundRouteDstPrefixInput.value.trim(),
      dst_suffix: els.inboundRouteDstSuffixInput.value.trim(),
      src_strip: Number(els.inboundRouteSrcStripInput.value),
      src_prefix: els.inboundRouteSrcPrefixInput.value.trim(),
      src_suffix: els.inboundRouteSrcSuffixInput.value.trim(),
      target: els.inboundRouteTargetInput.value,
      priority: Number(els.inboundRoutePriorityInput.value),
      enabled: els.inboundRouteEnabledInput.checked
    };
    await api(state.editingInboundRouteId === null ? "/api/inbound-routes" : `/api/inbound-routes/${encodeURIComponent(state.selectedDomainId)}/${state.editingInboundRouteId}`, { method: state.editingInboundRouteId === null ? "POST" : "PATCH", body: JSON.stringify(state.editingInboundRouteId === null ? { domain_id: state.selectedDomainId, ...payload } : payload) });
    resetInboundRouteForm(); await openDomainDetail(state.selectedDomainId); closeEditor(); setFormMessage(t("message.inboundRouteSaved"), "ok");
  } catch (error) { setFormMessage(error.message, "error"); }
}

async function saveAiAgent(event) {
  event.preventDefault();
  if (!state.selectedDomainId) return;
  try {
    const payload = {
      agent_id: els.aiAgentIdInput.value.trim(),
      name: els.aiAgentNameInput.value.trim(),
      service_number: els.aiAgentServiceNumberInput.value.trim(),
      profile_id: els.aiAgentProfileInput.value,
      fallback_target: els.aiAgentFallbackTargetInput.value.trim() || null,
      enabled: els.aiAgentEnabledInput.checked
    };
    await api(state.editingAiAgentId === null ? "/api/ai-agents" : `/api/ai-agents/${encodeURIComponent(state.selectedDomainId)}/${state.editingAiAgentId}`, { method: state.editingAiAgentId === null ? "POST" : "PATCH", body: JSON.stringify(state.editingAiAgentId === null ? { domain_id: state.selectedDomainId, ...payload } : payload) });
    resetAiAgentForm(); await openDomainDetail(state.selectedDomainId, "aiAgents"); closeEditor(); setFormMessage(t("message.aiAgentSaved"), "ok");
  } catch (error) { setFormMessage(error.message, "error"); }
}

async function deleteRegTrunk(id) { await deleteDomainResource("/api/reg-trunks", id, "message.regTrunkDeleted"); }
async function deleteRegAccount(id) { await deleteDomainResource("/api/reg-accounts", id, "message.regAccountDeleted"); }
async function deleteInboundRoute(id) { await deleteDomainResource("/api/inbound-routes", id, "message.inboundRouteDeleted"); }
async function deleteAiAgent(id) { await deleteDomainResource("/api/ai-agents", id, "message.aiAgentDeleted"); }
async function deleteDomainResource(endpoint, id, messageKey) {
  if (!state.selectedDomainId) return;
  try { await api(`${endpoint}/${encodeURIComponent(state.selectedDomainId)}/${id}`, { method: "DELETE" }); await openDomainDetail(state.selectedDomainId); setFormMessage(t(messageKey), "ok"); } catch (error) { setFormMessage(error.message, "error"); }
}

async function loadAll() {
  await loadStatus();
  await loadDomains();
  await loadRegistrations(null);
}

function setLoginMessage(text, kind = "") {
  els.loginMessage.textContent = text;
  els.loginMessage.className = `form-message login-message ${kind}`;
}

function showLogin(message = "") {
  state.principal = null;
  els.appShell.hidden = true;
  els.loginScreen.hidden = false;
  els.loginPasswordInput.value = "";
  setLoginMessage(message, message ? "error" : "");
  window.setTimeout(() => els.loginUsernameInput.focus(), 0);
}

function showApp(principal) {
  state.principal = principal;
  els.loginScreen.hidden = true;
  els.appShell.hidden = false;
  els.currentUsername.textContent = principal.username;
  els.currentUserRole.textContent = t(`users.roles.${principal.role}`);
  els.currentUserAvatar.textContent = principal.username.slice(0, 1).toUpperCase();
  els.openDomainCreateButton.hidden = !isSystemAdmin();
  els.sidebarSystemStatus.hidden = !isSystemAdmin();
}

async function enterAuthenticatedApp(principal) {
  showApp(principal);
  if (isSystemAdmin()) {
    await loadAll();
    setView("status");
    return;
  }
  await loadDomains();
  if (state.domains.length === 1) {
    await openDomainOverview(state.domains[0].domain_id);
  } else {
    setView("domains");
  }
}

async function authenticate(event) {
  event.preventDefault();
  if (!els.loginForm.reportValidity()) return;
  els.loginSubmitButton.disabled = true;
  setLoginMessage("");
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsernameInput.value.trim(),
        password: els.loginPasswordInput.value
      })
    });
    await enterAuthenticatedApp(result.user);
  } catch (error) {
    showLogin(error.message);
  } finally {
    els.loginSubmitButton.disabled = false;
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch (error) {
    console.error(error);
  }
  showLogin();
}

function leaveDomainContext() {
  setView("domains");
}

async function refreshCurrentView() {
  if (state.currentView === "domainOverview" && state.selectedDomainId) {
    await openDomainOverview(state.selectedDomainId);
    return;
  }
  if (state.currentView === "detail" && state.selectedDomainId) {
    await openDomainDetail(state.selectedDomainId, state.currentTab);
    return;
  }
  if (state.currentView === "calls" || state.currentView === "cdr") {
    await runtimeViews.refresh(state.currentView);
    return;
  }
  if (state.currentView === "recording") {
    await recordingView.refresh("recording");
    return;
  }
  if (state.currentView === "ai") {
    await aiView.refresh("ai");
    return;
  }
  if (state.currentView === "system") {
    await systemView.refresh("system");
    return;
  }
  if (state.currentView === "aiGateway") {
    await aiGatewayView.refresh("aiGateway");
    return;
  }
  if (state.currentView === "users") {
    await usersView.refresh("users");
    return;
  }
  if (!isSystemAdmin()) {
    await loadDomains();
    return;
  }
  await loadAll();
}

async function changeLanguage(event) {
  await loadI18n(event.target.value);
  applyI18n();
  els.languageSelect.value = currentLanguage();
  els.languageSelectApp.value = currentLanguage();
  setView(state.currentView);
  await refreshCurrentView();
}

function bindEvents() {
  els.loginForm.addEventListener("submit", authenticate);
  els.logoutButton.addEventListener("click", logout);
  els.languageSelect.addEventListener("change", event => changeLanguage(event).catch(error => setLoginMessage(error.message)));
  els.languageSelectApp.addEventListener("change", event => changeLanguage(event).catch(error => setFormMessage(error.message, "error")));
  els.navStatusButton.addEventListener("click", () => setView("status"));
  els.navCallsButton.addEventListener("click", () => setView("calls"));
  els.navCdrButton.addEventListener("click", () => setView("cdr"));
  els.navRecordingButton.addEventListener("click", () => setView("recording"));
  els.navAiButton.addEventListener("click", () => setView("ai"));
  els.navSystemButton.addEventListener("click", () => setView("system"));
  els.navAiGatewayButton.addEventListener("click", () => setView("aiGateway"));
  els.navDomainsButton.addEventListener("click", () => setView("domains"));
  els.navUsersButton.addEventListener("click", () => setView("users"));
  els.navDomainOverviewButton.addEventListener("click", () => setView("domainOverview"));
  els.navDomainExtensionsButton.addEventListener("click", () => openDomainDetail(state.selectedDomainId, "extensions"));
  els.navDomainAiAgentsButton.addEventListener("click", () => openDomainDetail(state.selectedDomainId, "aiAgents"));
  els.navDomainTrunksButton.addEventListener("click", () => openDomainDetail(state.selectedDomainId, "trunks"));
  els.navDomainRoutesButton.addEventListener("click", () => openDomainDetail(state.selectedDomainId, "routes"));
  els.exitDomainButton.addEventListener("click", leaveDomainContext);
  els.domainContextSelect.addEventListener("change", () => openDomainOverview(els.domainContextSelect.value));
  els.domainOverviewCallsButton.addEventListener("click", () => setView("calls"));
  els.domainOverviewExtensionsButton.addEventListener("click", () => openDomainDetail(state.selectedDomainId, "extensions"));
  els.domainOverviewRecordingButton.addEventListener("click", () => setView("recording"));
  els.domainOverviewAiButton.addEventListener("click", () => setView("ai"));
  els.backToDomainsButton.addEventListener("click", leaveDomainContext);
  els.refreshButton.addEventListener("click", refreshCurrentView);
  els.domainSearchInput.addEventListener("input", () => {
    state.pages.domains = 1;
    renderDomainTable();
  });
  els.openDomainCreateButton.addEventListener("click", () => openDomainModal());
  els.closeDomainModalButton.addEventListener("click", closeDomainModal);
  els.cancelDomainModalButton.addEventListener("click", closeDomainModal);
  els.domainModalForm.addEventListener("submit", saveDomain);
  els.openExtensionCreateButton.addEventListener("click", () => openEditor("extensions"));
  els.openExtensionBatchButton.addEventListener("click", () => openEditor("extensionBatch"));
  els.openTrunkCreateButton.addEventListener("click", () => openEditor("trunks"));
  els.openRegTrunkCreateButton.addEventListener("click", () => openEditor("regTrunks"));
  els.openRouteCreateButton.addEventListener("click", () => openEditor("routes"));
  els.openInboundRouteCreateButton.addEventListener("click", () => openEditor("inboundRoutes"));
  els.openAiAgentCreateButton.addEventListener("click", () => openEditor("aiAgents"));
  els.showPeerTrunksButton.addEventListener("click", () => setTrunkView("peer"));
  els.showRegTrunksButton.addEventListener("click", () => setTrunkView("registered"));
  els.showOutboundRoutesButton.addEventListener("click", () => setRouteView("outbound"));
  els.showInboundRoutesButton.addEventListener("click", () => setRouteView("inbound"));
  els.closeEditorButton.addEventListener("click", closeEditor);
  els.detailSide.addEventListener("click", event => {
    if (event.target === els.detailSide) closeEditor();
  });
  els.extensionForm.addEventListener("submit", saveExtension);
  els.extensionBatchForm.addEventListener("submit", saveExtensionBatch);
  els.resetExtensionButton.addEventListener("click", resetExtensionForm);
  els.resetExtensionBatchButton.addEventListener("click", resetExtensionBatchForm);
  els.toggleExtPasswordButton.addEventListener("click", () => togglePassword(els.extPasswordInput, els.toggleExtPasswordButton));
  els.toggleBatchPasswordButton.addEventListener("click", () => togglePassword(els.batchPasswordInput, els.toggleBatchPasswordButton));
  els.trunkForm.addEventListener("submit", saveTrunk);
  els.resetTrunkButton.addEventListener("click", resetTrunkForm);
  els.routeForm.addEventListener("submit", saveRoute);
  els.resetRouteButton.addEventListener("click", resetRouteForm);
  els.addRouteTrunkButton.addEventListener("click", addRouteTrunkRef);
  els.routeTrunkRefsList.addEventListener("click", event => {
    const up = event.target.closest("[data-route-ref-up]");
    const down = event.target.closest("[data-route-ref-down]");
    const remove = event.target.closest("[data-route-ref-remove]");
    if (up) moveRouteTrunkRef(Number(up.getAttribute("data-route-ref-up")), -1);
    if (down) moveRouteTrunkRef(Number(down.getAttribute("data-route-ref-down")), 1);
    if (remove) {
      state.routeTrunkRefs.splice(Number(remove.getAttribute("data-route-ref-remove")), 1);
      renderRouteTrunkRefs();
    }
  });
  els.regTrunkForm.addEventListener("submit", saveRegTrunk);
  els.resetRegTrunkButton.addEventListener("click", resetRegTrunkForm);
  els.regAccountForm.addEventListener("submit", saveRegAccount);
  els.resetRegAccountButton.addEventListener("click", resetRegAccountForm);
  els.toggleRegAccountPasswordButton.addEventListener("click", () => togglePassword(els.regAccountPasswordInput, els.toggleRegAccountPasswordButton));
  els.toggleDomainPasswordButton.addEventListener("click", () => togglePassword(els.domainModalPasswordInput, els.toggleDomainPasswordButton));
  els.inboundRouteForm.addEventListener("submit", saveInboundRoute);
  els.resetInboundRouteButton.addEventListener("click", resetInboundRouteForm);
  els.aiAgentForm.addEventListener("submit", saveAiAgent);
  els.resetAiAgentButton.addEventListener("click", resetAiAgentForm);
}

async function init() {
  await loadI18n();
  applyI18n();
  els.languageSelect.value = currentLanguage();
  els.languageSelectApp.value = currentLanguage();
  runtimeViews = createRuntimeViews({ t });
  aiView = createAiView({ t });
  recordingView = createRecordingView({ t });
  systemView = createSystemView({ t, fetchStatus: loadStatus });
  aiGatewayView = createAiGatewayView({ t });
  usersView = createUsersView({ t });
  bindEvents();
  window.addEventListener("voipswitch:auth-required", () => showLogin(t("login.expired")));
  resetPasswordVisibility(els.extPasswordInput, els.toggleExtPasswordButton);
  resetPasswordVisibility(els.batchPasswordInput, els.toggleBatchPasswordButton);
  resetPasswordVisibility(els.regAccountPasswordInput, els.toggleRegAccountPasswordButton);
  resetPasswordVisibility(els.domainModalPasswordInput, els.toggleDomainPasswordButton);
  setDetailTab("extensions");
  setTrunkView("peer");
  setRouteView("outbound");
  try {
    const result = await api("/api/auth/me");
    await enterAuthenticatedApp(result.user);
  } catch (error) {
    showLogin(error.code === "AUTH_REQUIRED" ? "" : error.message);
  }
}

init().catch(error => {
  console.error(error);
  setFormMessage(error.message, "error");
});
