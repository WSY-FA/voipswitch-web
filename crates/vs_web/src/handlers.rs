use crate::WebState;
use crate::auth::{AuthSession, Principal, expired_session_cookie, session_cookie};
use crate::core_client::{CoreCommandError, CoreExecution};
use crate::web_crud::{PageParams, WebConfigCrud, WebTable, cond_eq};
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use voipswitch_core::command_service::{ApiCommand, Command, CommandRenderData, ConfigCommand};
use voipswitch_core::types::ids::DomainId;
use voipswitch_core::types::time::unix_timestamp_ms;

type SharedState = Arc<WebState>;
const INDEX_HTML: &str = include_str!("../static/index.html");
const APP_CSS: &str = include_str!("../static/app.css");
const APP_JS: &str = include_str!("../static/js/app.js");
const API_JS: &str = include_str!("../static/js/core/api.js");
const FORMAT_JS: &str = include_str!("../static/js/core/format.js");
const I18N_JS: &str = include_str!("../static/js/core/i18n.js");
const REGISTRATIONS_JS: &str = include_str!("../static/js/core/registrations.js");
const CONFIG_JS: &str = include_str!("../static/js/views/config.js");
const RUNTIME_JS: &str = include_str!("../static/js/views/runtime.js");
const SYSTEM_JS: &str = include_str!("../static/js/views/system.js");
const AI_GATEWAY_JS: &str = include_str!("../static/js/views/ai-gateway.js");
const RECORDING_JS: &str = include_str!("../static/js/views/recording.js");
const AI_JS: &str = include_str!("../static/js/views/ai.js");
const USERS_JS: &str = include_str!("../static/js/views/users.js");
const I18N_ZH_CN: &str = include_str!("../static/i18n/zh-CN.json");
const I18N_EN_US: &str = include_str!("../static/i18n/en-US.json");

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/", get(index))
        .route("/static/:file", get(static_file))
        .route("/static/js/:file", get(static_js_file))
        .route("/static/js/core/:file", get(static_core_js_file))
        .route("/static/js/views/:file", get(static_view_js_file))
        .route("/static/i18n/:file", get(i18n_file))
        .route("/api/auth/login", axum::routing::post(login))
        .route("/api/auth/me", get(current_user))
        .route("/api/auth/logout", axum::routing::post(logout))
        .route("/api/users", get(users).post(create_user))
        .route(
            "/api/users/:user_id",
            patch(update_user).delete(delete_user),
        )
        .route("/api/status", get(status))
        .route(
            "/api/system-settings",
            get(system_settings).patch(update_system_settings),
        )
        .route("/api/settings/call-trace", patch(update_call_trace_setting))
        .route("/api/calls", get(calls))
        .route("/api/sessions", get(sessions))
        .route("/api/cdr", get(cdr))
        .route("/api/cdr/:call_id/trace", get(call_trace))
        .route("/api/cdr/:call_id/ai-results", get(call_ai_results))
        .route("/api/cdr/:call_id/recording", get(call_recording))
        .route(
            "/api/cdr/:call_id/recording/content",
            get(call_recording_content),
        )
        .route(
            "/api/cdr/:call_id/recording/download",
            get(call_recording_download),
        )
        .route("/api/domains", get(domains).post(upsert_domain))
        .route(
            "/api/domains/:domain_id",
            axum::routing::delete(delete_domain),
        )
        .route("/api/extensions", get(extensions).post(create_extension))
        .route(
            "/api/extensions/batch",
            axum::routing::post(batch_extensions),
        )
        .route(
            "/api/extensions/:domain_id/:id",
            patch(update_extension).delete(delete_extension),
        )
        .route("/api/trunk-status", get(trunk_status))
        .route("/api/trunks", get(trunks).post(create_trunk))
        .route(
            "/api/trunks/:domain_id/:id",
            patch(update_trunk).delete(delete_trunk),
        )
        .route("/api/reg-trunks", get(reg_trunks).post(create_reg_trunk))
        .route(
            "/api/reg-trunks/:domain_id/:id",
            patch(update_reg_trunk).delete(delete_reg_trunk),
        )
        .route(
            "/api/reg-accounts",
            get(reg_accounts).post(create_reg_account),
        )
        .route(
            "/api/reg-accounts/:domain_id/:id",
            patch(update_reg_account).delete(delete_reg_account),
        )
        .route("/api/routes", get(routes).post(create_route))
        .route(
            "/api/routes/:domain_id/:id",
            patch(update_route).delete(delete_route),
        )
        .route(
            "/api/inbound-routes",
            get(inbound_routes).post(create_inbound_route),
        )
        .route(
            "/api/inbound-routes/:domain_id/:id",
            patch(update_inbound_route).delete(delete_inbound_route),
        )
        .route(
            "/api/recording-policies",
            get(recording_policies).post(create_recording_policy),
        )
        .route(
            "/api/recording-policies/:domain_id/:id",
            patch(update_recording_policy).delete(delete_recording_policy),
        )
        .route("/api/ai-profiles", get(ai_profiles))
        .route("/api/ai-gateway", get(ai_gateway))
        .route("/api/ai-policies", get(ai_policies).post(create_ai_policy))
        .route(
            "/api/ai-policies/:domain_id/:id",
            patch(update_ai_policy).delete(delete_ai_policy),
        )
        .route("/api/registrations", get(registrations))
}

async fn index() -> impl IntoResponse {
    content_response("text/html; charset=utf-8", INDEX_HTML)
}

async fn static_file(Path(file): Path<String>) -> Response {
    match file.as_str() {
        "app.css" => content_response("text/css; charset=utf-8", APP_CSS),
        _ => api_error(StatusCode::NOT_FOUND, "RESOURCE_NOT_FOUND", "not found"),
    }
}

async fn static_js_file(Path(file): Path<String>) -> Response {
    match file.as_str() {
        "app.js" => content_response("application/javascript; charset=utf-8", APP_JS),
        _ => api_error(StatusCode::NOT_FOUND, "RESOURCE_NOT_FOUND", "not found"),
    }
}

async fn static_core_js_file(Path(file): Path<String>) -> Response {
    match file.as_str() {
        "api.js" => content_response("application/javascript; charset=utf-8", API_JS),
        "format.js" => content_response("application/javascript; charset=utf-8", FORMAT_JS),
        "i18n.js" => content_response("application/javascript; charset=utf-8", I18N_JS),
        "registrations.js" => {
            content_response("application/javascript; charset=utf-8", REGISTRATIONS_JS)
        }
        _ => api_error(StatusCode::NOT_FOUND, "RESOURCE_NOT_FOUND", "not found"),
    }
}

async fn static_view_js_file(Path(file): Path<String>) -> Response {
    match file.as_str() {
        "config.js" => content_response("application/javascript; charset=utf-8", CONFIG_JS),
        "runtime.js" => content_response("application/javascript; charset=utf-8", RUNTIME_JS),
        "system.js" => content_response("application/javascript; charset=utf-8", SYSTEM_JS),
        "ai-gateway.js" => content_response("application/javascript; charset=utf-8", AI_GATEWAY_JS),
        "recording.js" => content_response("application/javascript; charset=utf-8", RECORDING_JS),
        "ai.js" => content_response("application/javascript; charset=utf-8", AI_JS),
        "users.js" => content_response("application/javascript; charset=utf-8", USERS_JS),
        _ => api_error(StatusCode::NOT_FOUND, "RESOURCE_NOT_FOUND", "not found"),
    }
}

async fn i18n_file(Path(file): Path<String>) -> Response {
    match file.as_str() {
        "zh-CN.json" => content_response("application/json; charset=utf-8", I18N_ZH_CN),
        "en-US.json" => content_response("application/json; charset=utf-8", I18N_EN_US),
        _ => api_error(StatusCode::NOT_FOUND, "RESOURCE_NOT_FOUND", "not found"),
    }
}

async fn login(State(state): State<SharedState>, Json(payload): Json<LoginPayload>) -> Response {
    let result = state
        .core
        .execute(Command::Api(ApiCommand {
            name: "web-auth".to_string(),
            args: vec!["verify".to_string()],
            domain_id: None,
            key: None,
            fields: fields([
                ("username", payload.username),
                ("password", payload.password),
            ]),
        }))
        .await;
    let execution = match result {
        Ok(execution) => execution,
        Err(err) => {
            if let Some(core_error) = err.downcast_ref::<CoreCommandError>() {
                let status = if core_error.code == "AUTH_FAILED" {
                    StatusCode::UNAUTHORIZED
                } else {
                    StatusCode::BAD_GATEWAY
                };
                return api_error_with_request_id(
                    status,
                    &core_error.request_id,
                    &core_error.code,
                    &core_error.message,
                );
            }
            return api_error(
                StatusCode::BAD_GATEWAY,
                "CORE_UNAVAILABLE",
                &err.to_string(),
            );
        }
    };
    let principal = match execution_principal(&execution) {
        Ok(principal) => principal,
        Err(err) => {
            return api_error(
                StatusCode::BAD_GATEWAY,
                "INVALID_CORE_RESPONSE",
                &err.to_string(),
            );
        }
    };
    let token = state.sessions.issue(principal.clone());
    let mut response = api_ok(json!({ "user": principal }));
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&session_cookie(&token)).expect("valid session cookie"),
    );
    response
}

async fn current_user(auth: AuthSession) -> Response {
    api_ok(json!({ "user": auth.principal }))
}

async fn logout(State(state): State<SharedState>, auth: AuthSession) -> Response {
    state.sessions.revoke(&auth.token);
    let mut response = api_ok(json!({ "logged_out": true }));
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&expired_session_cookie()).expect("valid expired cookie"),
    );
    response
}

async fn users(State(state): State<SharedState>, auth: AuthSession) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    api_result(
        state
            .core
            .execute(web_user_command("list", BTreeMap::new()))
            .await,
    )
}

async fn create_user(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<UserCreatePayload>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    api_result(
        state
            .core
            .execute(web_user_command(
                "create",
                fields([
                    ("username", payload.username),
                    ("password", payload.password),
                    ("enabled", payload.enabled.to_string()),
                    ("domain_ids", payload.domain_ids.join(",")),
                ]),
            ))
            .await,
    )
}

async fn update_user(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(user_id): Path<i64>,
    Json(payload): Json<UserUpdatePayload>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let mut command_fields = fields([
        ("user_id", user_id.to_string()),
        ("username", payload.username),
        ("enabled", payload.enabled.to_string()),
        ("domain_ids", payload.domain_ids.join(",")),
    ]);
    if let Some(password) = payload.password.filter(|value| !value.is_empty()) {
        command_fields.insert("password".to_string(), password);
    }
    let result = state
        .core
        .execute(web_user_command("update", command_fields))
        .await;
    if result.is_ok() {
        state.sessions.revoke_user(user_id, None);
    }
    api_result(result)
}

async fn delete_user(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(user_id): Path<i64>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let result = state
        .core
        .execute(web_user_command(
            "delete",
            fields([("user_id", user_id.to_string())]),
        ))
        .await;
    if result.is_ok() {
        state.sessions.revoke_user(user_id, None);
    }
    api_result(result)
}

fn web_user_command(action: &str, fields: BTreeMap<String, String>) -> Command {
    Command::Api(ApiCommand {
        name: "web-user".to_string(),
        args: vec![action.to_string()],
        domain_id: None,
        key: None,
        fields,
    })
}

fn execution_principal(execution: &CoreExecution) -> anyhow::Result<Principal> {
    let CommandRenderData::Object { value } = &execution.result.data else {
        anyhow::bail!("web auth returned an unexpected render type");
    };
    Ok(serde_json::from_value(
        value
            .get("data")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("web auth response has no data"))?,
    )?)
}

async fn status(State(state): State<SharedState>, auth: AuthSession) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let result = state.core.execute(Command::Status).await;
    apply_web_log_level(&result);
    api_result(result)
}

async fn system_settings(State(state): State<SharedState>, auth: AuthSession) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    api_result(
        state
            .core
            .execute(global_settings_command(
                "select",
                fields([("table", "global_setting".to_string())]),
            ))
            .await,
    )
}

async fn update_system_settings(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<SystemSettingsPayload>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let log_level = payload.log_level.trim().to_ascii_lowercase();
    let result = state
        .core
        .execute(global_settings_command(
            "update",
            fields([
                ("table", "global_setting".to_string()),
                ("cond", "any".to_string()),
                (
                    "set",
                    format!(
                        "sip_port={},log_level={},call_trace_enabled={},recording_dir={},recording_retention_days={},recording_max_size_gb={},cdr_spool_warning_mb={},cdr_spool_reject_mb={},cdr_spool_resume_mb={}",
                        payload.sip_port,
                        log_level,
                        payload.call_trace_enabled,
                        payload.recording_dir,
                        payload.recording_retention_days,
                        payload.recording_max_size_gb,
                        payload.cdr_spool_warning_mb,
                        payload.cdr_spool_reject_mb,
                        payload.cdr_spool_resume_mb
                    ),
                ),
            ]),
        ))
        .await;
    if result.is_ok() {
        let _ = crate::logging::set_level(&log_level);
    }
    api_result(result)
}

async fn update_call_trace_setting(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<CallTraceSettingPayload>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    api_result(
        state
            .core
            .execute(Command::Config(ConfigCommand {
                resource: "vc_config".to_string(),
                action: "update".to_string(),
                domain_id: None,
                key: Some("global_setting".to_string()),
                fields: fields([
                    ("table", "global_setting".to_string()),
                    ("cond", "key=call_trace_enabled".to_string()),
                    ("set", format!("value={}", payload.enabled)),
                ]),
            }))
            .await,
    )
}

fn global_settings_command(action: &str, fields: BTreeMap<String, String>) -> Command {
    Command::Config(ConfigCommand {
        resource: "vc_config".to_string(),
        action: action.to_string(),
        domain_id: None,
        key: Some("global_setting".to_string()),
        fields,
    })
}

fn apply_web_log_level(result: &anyhow::Result<CoreExecution>) {
    let Ok(execution) = result else {
        return;
    };
    let CommandRenderData::Kv { items } = &execution.result.data else {
        return;
    };
    if let Some(level) = items.get("log_level").and_then(serde_json::Value::as_str) {
        let _ = crate::logging::set_level(level);
    }
}

async fn calls(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<RuntimeQuery>,
) -> Response {
    let domain = match scoped_domain(&auth, query.domain, false) {
        Ok(domain) => domain,
        Err(response) => return response,
    };
    api_result(
        state
            .core
            .execute(show_command("calls", domain, BTreeMap::new()))
            .await,
    )
}

async fn sessions(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<RuntimeQuery>,
) -> Response {
    let domain = match scoped_domain(&auth, query.domain, false) {
        Ok(domain) => domain,
        Err(response) => return response,
    };
    api_result(
        state
            .core
            .execute(show_command("sessions", domain, BTreeMap::new()))
            .await,
    )
}

async fn cdr(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<CdrQuery>,
) -> Response {
    let domain = match scoped_domain(&auth, query.domain, false) {
        Ok(domain) => domain,
        Err(response) => return response,
    };
    let mut fields = BTreeMap::new();
    fields.insert("page".to_string(), query.page.unwrap_or(1).to_string());
    fields.insert(
        "page-size".to_string(),
        query.page_size.unwrap_or(50).to_string(),
    );
    api_result(
        state
            .core
            .execute(show_command("cdr", domain, fields))
            .await,
    )
}

async fn call_trace(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(call_id): Path<String>,
) -> Response {
    let result = state
        .core
        .execute(Command::Api(ApiCommand {
            name: "show".to_string(),
            args: vec!["call-trace".to_string(), call_id],
            domain_id: None,
            key: None,
            fields: BTreeMap::new(),
        }))
        .await;
    if let Err(response) = authorize_execution_domain(&auth, &result) {
        return response;
    }
    api_result(result)
}

async fn call_ai_results(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(call_id): Path<String>,
    Query(query): Query<AiResultQuery>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &query.domain) {
        return response;
    }
    api_result(
        state
            .core
            .execute(Command::Api(ApiCommand {
                name: "show".to_string(),
                args: vec!["ai-results".to_string(), call_id],
                domain_id: Some(DomainId::from(query.domain)),
                key: None,
                fields: BTreeMap::new(),
            }))
            .await,
    )
}

async fn call_recording(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(call_id): Path<String>,
) -> Response {
    let result = state
        .core
        .execute(recording_show_command("recording", call_id))
        .await;
    if let Err(response) = authorize_execution_domain(&auth, &result) {
        return response;
    }
    api_result(result)
}

async fn call_recording_content(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(call_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    stream_recording(&state, &auth, &call_id, &headers, false).await
}

async fn call_recording_download(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(call_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    stream_recording(&state, &auth, &call_id, &headers, true).await
}

async fn stream_recording(
    state: &SharedState,
    auth: &AuthSession,
    call_id: &str,
    headers: &HeaderMap,
    download: bool,
) -> Response {
    let grant = match recording_file_grant(state, call_id).await {
        Ok(grant) => grant,
        Err(err) => {
            if let Some(core_error) = err.downcast_ref::<CoreCommandError>() {
                return api_command_error(core_error);
            }
            return api_error(
                StatusCode::BAD_GATEWAY,
                "CORE_UNAVAILABLE",
                &err.to_string(),
            );
        }
    };
    if !auth.principal.can_access_domain(&grant.domain_id) {
        return forbidden();
    }
    let mut file = match tokio::fs::File::open(&grant.path).await {
        Ok(file) => file,
        Err(_) => {
            return api_error(
                StatusCode::NOT_FOUND,
                "RESOURCE_NOT_FOUND",
                "recording file not found",
            );
        }
    };
    let size = match file.metadata().await {
        Ok(metadata) => metadata.len(),
        Err(err) => {
            return api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "RECORDING_READ_FAILED",
                &err.to_string(),
            );
        }
    };
    let range = match parse_range(headers.get(header::RANGE), size) {
        Ok(range) => range,
        Err(message) => {
            return (
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{size}"))],
                message,
            )
                .into_response();
        }
    };
    let (start, end, status) = match range {
        Some((start, end)) => (start, end, StatusCode::PARTIAL_CONTENT),
        None => (0, size.saturating_sub(1), StatusCode::OK),
    };
    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "RECORDING_READ_FAILED",
            "cannot seek recording file",
        );
    }
    let length = if size == 0 { 0 } else { end - start + 1 };
    let stream = ReaderStream::new(file.take(length));
    let safe_name = safe_download_name(&grant.file_name);
    let disposition = if download {
        format!("attachment; filename=\"{safe_name}\"")
    } else {
        format!("inline; filename=\"{safe_name}\"")
    };
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "audio/wav")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::CONTENT_DISPOSITION, disposition)
        .header(header::CACHE_CONTROL, "no-store");
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
    }
    builder.body(Body::from_stream(stream)).unwrap_or_else(|_| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "RECORDING_READ_FAILED",
            "cannot build recording response",
        )
    })
}

async fn recording_file_grant(
    state: &SharedState,
    call_id: &str,
) -> anyhow::Result<RecordingFileGrant> {
    let execution = state
        .core
        .execute(recording_show_command(
            "recording-file",
            call_id.to_string(),
        ))
        .await?;
    let CommandRenderData::Object { value } = execution.result.data else {
        anyhow::bail!("recording file command returned an unexpected render type");
    };
    let data = value
        .get("data")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("recording file command did not return data"))?;
    Ok(serde_json::from_value(data)?)
}

fn recording_show_command(topic: &str, call_id: String) -> Command {
    Command::Api(ApiCommand {
        name: "show".to_string(),
        args: vec![topic.to_string(), call_id],
        domain_id: None,
        key: None,
        fields: BTreeMap::new(),
    })
}

fn parse_range(
    value: Option<&axum::http::HeaderValue>,
    size: u64,
) -> Result<Option<(u64, u64)>, &'static str> {
    let Some(value) = value else {
        return Ok(None);
    };
    if size == 0 {
        return Err("recording file is empty");
    }
    let value = value.to_str().map_err(|_| "invalid Range header")?;
    let range = value
        .strip_prefix("bytes=")
        .ok_or("only byte ranges are supported")?;
    if range.contains(',') {
        return Err("multiple ranges are not supported");
    }
    let (start, end) = range.split_once('-').ok_or("invalid Range header")?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| "invalid suffix range")?;
        if suffix == 0 {
            return Err("invalid suffix range");
        }
        let length = suffix.min(size);
        return Ok(Some((size - length, size - 1)));
    }
    let start = start.parse::<u64>().map_err(|_| "invalid range start")?;
    if start >= size {
        return Err("range starts beyond the recording file");
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>()
            .map_err(|_| "invalid range end")?
            .min(size - 1)
    };
    if end < start {
        return Err("range end precedes range start");
    }
    Ok(Some((start, end)))
}

fn safe_download_name(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if value.is_empty() {
        "recording.wav".to_string()
    } else {
        value
    }
}

fn show_command(topic: &str, domain: Option<String>, fields: BTreeMap<String, String>) -> Command {
    Command::Api(ApiCommand {
        name: "show".to_string(),
        args: vec![topic.to_string()],
        domain_id: domain.map(DomainId::from),
        key: None,
        fields,
    })
}

async fn domains(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    let page = if auth.principal.is_system_admin() {
        query.page_params()
    } else {
        Some(PageParams {
            page: 1,
            page_size: 500,
        })
    };
    let mut result = crud(&state)
        .select_collection(WebTable::Domain, None, None, None, page)
        .await;
    if !auth.principal.is_system_admin()
        && let Ok(execution) = &mut result
    {
        filter_domain_execution(execution, &auth.principal.domain_ids);
    }
    api_result(result)
}

async fn upsert_domain(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<DomainPayload>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let updated_domain_id = payload.domain_id.clone();
    let fields = fields([
        ("name", payload.name),
        ("realm", payload.realm),
        ("password", payload.password),
        ("remark", payload.remark),
        ("enabled", payload.enabled.to_string()),
    ]);
    let result = if let Some(domain_id) = payload.domain_id {
        crud(&state)
            .update(
                WebTable::Domain,
                None,
                cond_eq("domain_id", &domain_id),
                fields,
            )
            .await
    } else {
        crud(&state).insert(WebTable::Domain, None, fields).await
    };
    if result.is_ok()
        && let Some(domain_id) = updated_domain_id
    {
        state.sessions.revoke_domain_login(&domain_id);
    }
    api_result(result)
}

async fn delete_domain(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path(domain_id): Path<String>,
) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    let result = crud(&state)
        .delete(WebTable::Domain, None, cond_eq("domain_id", &domain_id))
        .await;
    if result.is_ok() {
        state.sessions.revoke_domain_login(&domain_id);
    }
    api_result(result)
}

async fn extensions(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    let page = query.page_params();
    let domain_id = match scoped_domain(&auth, query.domain, true) {
        Ok(Some(domain_id)) => domain_id,
        Ok(None) => unreachable!("required domain"),
        Err(response) => return response,
    };
    api_result(
        crud(&state)
            .select_collection(
                WebTable::Ext,
                Some(DomainId::from(domain_id)),
                None,
                None,
                page,
            )
            .await,
    )
}

async fn create_extension(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<ExtensionPayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &payload.domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::Ext,
                Some(DomainId::from(payload.domain_id)),
                fields([
                    ("number", payload.number),
                    ("auth_user", payload.auth_user),
                    ("password", payload.password),
                    ("enabled", payload.enabled.to_string()),
                ]),
            )
            .await,
    )
}

async fn update_extension(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<ExtensionUpdatePayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    let mut update_fields = fields([
        ("auth_user", payload.auth_user),
        ("enabled", payload.enabled.to_string()),
    ]);
    if let Some(password) = payload.password.filter(|password| !password.is_empty()) {
        update_fields.insert("password".to_string(), password);
    }
    api_result(
        crud(&state)
            .update(
                WebTable::Ext,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
                update_fields,
            )
            .await,
    )
}

async fn batch_extensions(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<ExtensionBatchPayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &payload.domain_id) {
        return response;
    }
    let count = payload.count.clamp(1, 1000);
    let width = payload.start_number.len();
    let Ok(start) = payload.start_number.parse::<u64>() else {
        return api_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "start_number must be numeric",
        );
    };
    let Some(end) = start.checked_add(count as u64 - 1) else {
        return api_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "extension number range is too large",
        );
    };
    let records = (start..=end)
        .map(|value| {
            let number = format!("{value:0width$}", width = width);
            json!({
                "number": number,
                "auth_user": number,
                "password": payload.password,
                "enabled": payload.enabled,
            })
        })
        .collect::<Vec<_>>();
    api_result(
        crud(&state)
            .batch_insert(
                WebTable::Ext,
                Some(DomainId::from(payload.domain_id)),
                json!(records),
            )
            .await,
    )
}

async fn delete_extension(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .delete(
                WebTable::Ext,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
            )
            .await,
    )
}

async fn registrations(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<DomainQuery>,
) -> Response {
    let domain = match scoped_domain(&auth, query.domain, false) {
        Ok(domain) => domain,
        Err(response) => return response,
    };
    api_result(
        state
            .core
            .execute(Command::Config(ConfigCommand {
                resource: "vc_config".to_string(),
                action: "select".to_string(),
                domain_id: domain.map(DomainId::from),
                key: Some("ext_status".to_string()),
                fields: fields([("table", "ext_status".to_string())]),
            }))
            .await,
    )
}

async fn trunk_status(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<DomainQuery>,
) -> Response {
    let domain = match scoped_domain(&auth, query.domain, false) {
        Ok(domain) => domain,
        Err(response) => return response,
    };
    api_result(
        state
            .core
            .execute(Command::Config(ConfigCommand {
                resource: "vc_config".to_string(),
                action: "select".to_string(),
                domain_id: domain.map(DomainId::from),
                key: Some("siptrk_status".to_string()),
                fields: fields([("table", "siptrk_status".to_string())]),
            }))
            .await,
    )
}

async fn trunks(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    let page = query.page_params();
    let domain_id = match scoped_domain(&auth, query.domain, true) {
        Ok(Some(domain_id)) => domain_id,
        Ok(None) => unreachable!("required domain"),
        Err(response) => return response,
    };
    api_result(
        crud(&state)
            .select_collection(
                WebTable::PeerTrunk,
                Some(DomainId::from(domain_id)),
                None,
                None,
                page,
            )
            .await,
    )
}

async fn create_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<TrunkPayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::PeerTrunk,
                Some(DomainId::from(domain_id)),
                peer_trunk_fields(payload.into()),
            )
            .await,
    )
}

async fn delete_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .delete(
                WebTable::PeerTrunk,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
            )
            .await,
    )
}

async fn update_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<PeerTrunkUpdatePayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    update_domain_resource(
        &state,
        &auth,
        WebTable::PeerTrunk,
        domain_id,
        id,
        peer_trunk_fields(payload),
    )
    .await
}

async fn routes(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    let page = query.page_params();
    let domain_id = match scoped_domain(&auth, query.domain, true) {
        Ok(Some(domain_id)) => domain_id,
        Ok(None) => unreachable!("required domain"),
        Err(response) => return response,
    };
    api_result(
        crud(&state)
            .select_collection(
                WebTable::OutboundRoute,
                Some(DomainId::from(domain_id)),
                None,
                None,
                page,
            )
            .await,
    )
}

async fn create_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<RoutePayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::OutboundRoute,
                Some(DomainId::from(domain_id)),
                outbound_route_fields(payload.into()),
            )
            .await,
    )
}

async fn delete_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .delete(
                WebTable::OutboundRoute,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
            )
            .await,
    )
}

async fn update_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<OutboundRouteUpdatePayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    update_domain_resource(
        &state,
        &auth,
        WebTable::OutboundRoute,
        domain_id,
        id,
        outbound_route_fields(payload),
    )
    .await
}

async fn reg_trunks(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    table_collection(&state, &auth, query, WebTable::RegTrunk).await
}

async fn create_reg_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<RegTrunkPayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::RegTrunk,
                Some(DomainId::from(domain_id)),
                reg_trunk_fields(payload.into()),
            )
            .await,
    )
}

async fn delete_reg_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    delete_domain_resource(&state, &auth, WebTable::RegTrunk, domain_id, id).await
}

async fn update_reg_trunk(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<RegTrunkUpdatePayload>,
) -> Response {
    update_domain_resource(
        &state,
        &auth,
        WebTable::RegTrunk,
        domain_id,
        id,
        reg_trunk_fields(payload),
    )
    .await
}

async fn reg_accounts(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    table_collection(&state, &auth, query, WebTable::RegAccount).await
}

async fn create_reg_account(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<RegAccountPayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &payload.domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::RegAccount,
                Some(DomainId::from(payload.domain_id)),
                fields([
                    ("reg_trunk_id", payload.reg_trunk_id.to_string()),
                    ("auth_name", payload.auth_name),
                    ("auth_pwd", payload.auth_pwd),
                    ("enabled", payload.enabled.to_string()),
                ]),
            )
            .await,
    )
}

async fn delete_reg_account(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    delete_domain_resource(&state, &auth, WebTable::RegAccount, domain_id, id).await
}

async fn update_reg_account(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<RegAccountUpdatePayload>,
) -> Response {
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    let mut values = fields([
        ("reg_trunk_id", payload.reg_trunk_id.to_string()),
        ("auth_name", payload.auth_name),
        ("enabled", payload.enabled.to_string()),
    ]);
    if let Some(password) = payload.auth_pwd.filter(|password| !password.is_empty()) {
        values.insert("auth_pwd".to_string(), password);
    }
    update_domain_resource(&state, &auth, WebTable::RegAccount, domain_id, id, values).await
}

async fn inbound_routes(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    table_collection(&state, &auth, query, WebTable::InboundRoute).await
}

async fn create_inbound_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<InboundRoutePayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::InboundRoute,
                Some(DomainId::from(domain_id)),
                inbound_route_fields(payload.into()),
            )
            .await,
    )
}

async fn delete_inbound_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    delete_domain_resource(&state, &auth, WebTable::InboundRoute, domain_id, id).await
}

async fn update_inbound_route(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<InboundRouteUpdatePayload>,
) -> Response {
    update_domain_resource(
        &state,
        &auth,
        WebTable::InboundRoute,
        domain_id,
        id,
        inbound_route_fields(payload),
    )
    .await
}

async fn recording_policies(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    table_collection(&state, &auth, query, WebTable::RecordingPolicy).await
}

async fn create_recording_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<RecordingPolicyPayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::RecordingPolicy,
                Some(DomainId::from(domain_id)),
                recording_policy_fields(payload),
            )
            .await,
    )
}

async fn update_recording_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<RecordingPolicyPayload>,
) -> Response {
    update_domain_resource(
        &state,
        &auth,
        WebTable::RecordingPolicy,
        domain_id,
        id,
        recording_policy_fields(payload),
    )
    .await
}

async fn delete_recording_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    delete_domain_resource(&state, &auth, WebTable::RecordingPolicy, domain_id, id).await
}

async fn ai_profiles(State(state): State<SharedState>, _auth: AuthSession) -> Response {
    api_result(
        state
            .core
            .execute(Command::Api(ApiCommand {
                name: "show".to_string(),
                args: vec!["ai-profiles".to_string()],
                domain_id: None,
                key: None,
                fields: BTreeMap::new(),
            }))
            .await,
    )
}

async fn ai_gateway(State(state): State<SharedState>, auth: AuthSession) -> Response {
    if let Some(response) = system_admin_required(&auth) {
        return response;
    }
    api_result(
        state
            .core
            .execute(Command::Api(ApiCommand {
                name: "show".to_string(),
                args: vec!["ai-profiles".to_string()],
                domain_id: None,
                key: None,
                fields: BTreeMap::new(),
            }))
            .await,
    )
}

async fn ai_policies(
    State(state): State<SharedState>,
    auth: AuthSession,
    Query(query): Query<ListQuery>,
) -> Response {
    table_collection(&state, &auth, query, WebTable::AiPolicy).await
}

async fn create_ai_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Json(payload): Json<AiPolicyPayload>,
) -> Response {
    let domain_id = payload.domain_id.clone();
    if let Err(response) = ensure_domain_access(&auth, &domain_id) {
        return response;
    }
    api_result(
        crud(&state)
            .insert(
                WebTable::AiPolicy,
                Some(DomainId::from(domain_id)),
                ai_policy_fields(payload),
            )
            .await,
    )
}

async fn update_ai_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
    Json(payload): Json<AiPolicyPayload>,
) -> Response {
    update_domain_resource(
        &state,
        &auth,
        WebTable::AiPolicy,
        domain_id,
        id,
        ai_policy_fields(payload),
    )
    .await
}

async fn delete_ai_policy(
    State(state): State<SharedState>,
    auth: AuthSession,
    Path((domain_id, id)): Path<(String, u64)>,
) -> Response {
    delete_domain_resource(&state, &auth, WebTable::AiPolicy, domain_id, id).await
}

async fn table_collection(
    state: &SharedState,
    auth: &AuthSession,
    query: ListQuery,
    table: WebTable,
) -> Response {
    let page = query.page_params();
    let domain_id = match scoped_domain(auth, query.domain, true) {
        Ok(Some(domain_id)) => domain_id,
        Ok(None) => unreachable!("required domain"),
        Err(response) => return response,
    };
    api_result(
        crud(state)
            .select_collection(table, Some(DomainId::from(domain_id)), None, None, page)
            .await,
    )
}

async fn delete_domain_resource(
    state: &SharedState,
    auth: &AuthSession,
    table: WebTable,
    domain_id: String,
    id: u64,
) -> Response {
    if let Err(response) = ensure_domain_access(auth, &domain_id) {
        return response;
    }
    api_result(
        crud(state)
            .delete(
                table,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
            )
            .await,
    )
}

async fn update_domain_resource(
    state: &SharedState,
    auth: &AuthSession,
    table: WebTable,
    domain_id: String,
    id: u64,
    values: BTreeMap<String, String>,
) -> Response {
    if let Err(response) = ensure_domain_access(auth, &domain_id) {
        return response;
    }
    api_result(
        crud(state)
            .update(
                table,
                Some(DomainId::from(domain_id)),
                cond_eq("id", &id.to_string()),
                values,
            )
            .await,
    )
}

fn system_admin_required(auth: &AuthSession) -> Option<Response> {
    (!auth.principal.is_system_admin()).then(forbidden)
}

fn forbidden() -> Response {
    api_error(StatusCode::FORBIDDEN, "FORBIDDEN", "permission denied")
}

#[allow(clippy::result_large_err)]
fn ensure_domain_access(auth: &AuthSession, domain_id: &str) -> Result<(), Response> {
    if auth.principal.can_access_domain(domain_id) {
        Ok(())
    } else {
        Err(forbidden())
    }
}

#[allow(clippy::result_large_err)]
fn scoped_domain(
    auth: &AuthSession,
    requested: Option<String>,
    required: bool,
) -> Result<Option<String>, Response> {
    if let Some(domain_id) = requested {
        ensure_domain_access(auth, &domain_id)?;
        return Ok(Some(domain_id));
    }
    if auth.principal.is_system_admin() && !required {
        return Ok(None);
    }
    if !auth.principal.is_system_admin() && auth.principal.domain_ids.len() == 1 {
        return Ok(auth.principal.domain_ids.first().cloned());
    }
    Err(api_error(
        StatusCode::BAD_REQUEST,
        "DOMAIN_REQUIRED",
        "missing domain",
    ))
}

#[allow(clippy::result_large_err)]
fn authorize_execution_domain(
    auth: &AuthSession,
    result: &anyhow::Result<CoreExecution>,
) -> Result<(), Response> {
    let Ok(execution) = result else {
        return Ok(());
    };
    let domain_id = execution_domain(execution).ok_or_else(|| {
        api_error(
            StatusCode::BAD_GATEWAY,
            "INVALID_CORE_RESPONSE",
            "core response has no domain_id",
        )
    })?;
    ensure_domain_access(auth, domain_id)
}

fn execution_domain(execution: &CoreExecution) -> Option<&str> {
    let CommandRenderData::Object { value } = &execution.result.data else {
        return None;
    };
    value
        .get("data")
        .and_then(|data| data.get("domain_id"))
        .and_then(Value::as_str)
}

fn filter_domain_execution(execution: &mut CoreExecution, allowed: &[String]) {
    let CommandRenderData::Object { value } = &mut execution.result.data else {
        return;
    };
    let Some(data) = value.get_mut("data").and_then(Value::as_object_mut) else {
        return;
    };
    let total = if let Some(domains) = data.get_mut("domains").and_then(Value::as_array_mut) {
        domains.retain(|domain| {
            domain
                .get("domain_id")
                .and_then(Value::as_str)
                .is_some_and(|domain_id| allowed.iter().any(|item| item == domain_id))
        });
        domains.len()
    } else {
        0
    };
    if let Some(pagination) = data.get_mut("pagination").and_then(Value::as_object_mut) {
        pagination.insert("page".to_string(), json!(1));
        pagination.insert("page_size".to_string(), json!(500));
        pagination.insert("total".to_string(), json!(total));
        pagination.insert("total_pages".to_string(), json!(1));
    }
}

fn api_ok(value: Value) -> Response {
    Json(json!({
        "ok": true,
        "result": value,
    }))
    .into_response()
}

fn api_result(result: anyhow::Result<CoreExecution>) -> Response {
    match result {
        Ok(execution) => Json(json!({
            "ok": true,
            "result": {
                "request_id": execution.request_id,
                "success": true,
                "code": execution.result.code,
                "message": execution.result.message,
                "data": execution.result.data,
                "warnings": execution.result.warnings,
            }
        }))
        .into_response(),
        Err(err) => {
            if let Some(core_error) = err.downcast_ref::<CoreCommandError>() {
                return api_command_error(core_error);
            }
            api_error(
                StatusCode::BAD_GATEWAY,
                "CORE_UNAVAILABLE",
                &err.to_string(),
            )
        }
    }
}

fn api_command_error(error: &CoreCommandError) -> Response {
    let status = match error.code.as_str() {
        "RESOURCE_NOT_FOUND" => StatusCode::NOT_FOUND,
        "AUTH_FAILED" => StatusCode::UNAUTHORIZED,
        "FORBIDDEN" => StatusCode::FORBIDDEN,
        "VALIDATION_ERROR" | "INVALID_ARGUMENT" | "CONDITION_NOT_ALLOWED" => {
            StatusCode::BAD_REQUEST
        }
        "RESOURCE_IN_USE" | "ALREADY_EXISTS" | "PROTECTED_RESOURCE" => StatusCode::CONFLICT,
        _ => StatusCode::BAD_GATEWAY,
    };
    api_error_with_request_id(status, &error.request_id, &error.code, &error.message)
}

fn api_error(status: StatusCode, code: &str, message: &str) -> Response {
    api_error_with_request_id(
        status,
        &format!("web-{}", unix_timestamp_ms()),
        code,
        message,
    )
}

fn api_error_with_request_id(
    status: StatusCode,
    request_id: &str,
    code: &str,
    message: &str,
) -> Response {
    (
        status,
        Json(json!({
            "ok": false,
            "error": {
                "request_id": request_id,
                "code": code,
                "message": message,
                "data": {},
                "warnings": [],
            }
        })),
    )
        .into_response()
}

fn content_response(content_type: &'static str, body: &'static str) -> Response {
    (
        [
            (axum::http::header::CONTENT_TYPE, content_type),
            (axum::http::header::CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
struct DomainQuery {
    domain: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoginPayload {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct UserCreatePayload {
    username: String,
    password: String,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    domain_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct UserUpdatePayload {
    username: String,
    #[serde(default)]
    password: Option<String>,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    domain_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    domain: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct RuntimeQuery {
    domain: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CallTraceSettingPayload {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct SystemSettingsPayload {
    sip_port: u16,
    log_level: String,
    call_trace_enabled: bool,
    recording_dir: String,
    recording_retention_days: u64,
    recording_max_size_gb: u64,
    cdr_spool_warning_mb: u64,
    cdr_spool_reject_mb: u64,
    cdr_spool_resume_mb: u64,
}

#[derive(Debug, Deserialize)]
struct RecordingFileGrant {
    domain_id: String,
    file_name: String,
    path: PathBuf,
}

#[derive(Debug, Deserialize)]
struct CdrQuery {
    domain: Option<String>,
    page: Option<u64>,
    page_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AiResultQuery {
    domain: String,
}

impl ListQuery {
    fn page_params(&self) -> Option<PageParams> {
        self.page.map(|page| PageParams {
            page: page.max(1),
            page_size: self.page_size.unwrap_or(20).clamp(1, 500),
        })
    }
}

#[derive(Debug, Deserialize)]
struct DomainPayload {
    domain_id: Option<String>,
    name: String,
    realm: String,
    password: String,
    #[serde(default)]
    remark: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct ExtensionPayload {
    domain_id: String,
    number: String,
    auth_user: String,
    password: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct ExtensionUpdatePayload {
    auth_user: String,
    #[serde(default)]
    password: Option<String>,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct ExtensionBatchPayload {
    domain_id: String,
    start_number: String,
    count: usize,
    password: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct TrunkPayload {
    domain_id: String,
    name: String,
    server_host: String,
    #[serde(default = "default_sip_port")]
    server_port: u16,
    #[serde(default)]
    outbound_proxy_host: String,
    #[serde(default)]
    outbound_proxy_port: Option<u16>,
    #[serde(default = "default_transport")]
    transport: String,
    #[serde(default = "default_keep_alive")]
    keep_alive_seconds: u32,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct PeerTrunkUpdatePayload {
    name: String,
    server_host: String,
    #[serde(default = "default_sip_port")]
    server_port: u16,
    #[serde(default)]
    outbound_proxy_host: String,
    #[serde(default)]
    outbound_proxy_port: Option<u16>,
    #[serde(default = "default_transport")]
    transport: String,
    #[serde(default = "default_keep_alive")]
    keep_alive_seconds: u32,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RoutePayload {
    domain_id: String,
    name: String,
    dst_pattern: String,
    #[serde(default)]
    src_pattern: String,
    #[serde(default)]
    dst_strip: u8,
    #[serde(default)]
    dst_prefix: String,
    #[serde(default)]
    dst_suffix: String,
    #[serde(default)]
    src_strip: u8,
    #[serde(default)]
    src_prefix: String,
    #[serde(default)]
    src_suffix: String,
    trunk_refs: Vec<String>,
    #[serde(default = "default_priority")]
    priority: u16,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct OutboundRouteUpdatePayload {
    name: String,
    dst_pattern: String,
    #[serde(default)]
    src_pattern: String,
    #[serde(default)]
    dst_strip: u8,
    #[serde(default)]
    dst_prefix: String,
    #[serde(default)]
    dst_suffix: String,
    #[serde(default)]
    src_strip: u8,
    #[serde(default)]
    src_prefix: String,
    #[serde(default)]
    src_suffix: String,
    trunk_refs: Vec<String>,
    #[serde(default = "default_priority")]
    priority: u16,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RegTrunkPayload {
    domain_id: String,
    name: String,
    server_host: String,
    #[serde(default = "default_sip_port")]
    server_port: u16,
    #[serde(default)]
    outbound_proxy_host: String,
    #[serde(default)]
    outbound_proxy_port: Option<u16>,
    #[serde(default = "default_transport")]
    transport: String,
    #[serde(default = "default_keep_alive")]
    keep_alive_seconds: u32,
    #[serde(default = "default_requested_expires")]
    requested_expires_seconds: u32,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RegTrunkUpdatePayload {
    name: String,
    server_host: String,
    #[serde(default = "default_sip_port")]
    server_port: u16,
    #[serde(default)]
    outbound_proxy_host: String,
    #[serde(default)]
    outbound_proxy_port: Option<u16>,
    #[serde(default = "default_transport")]
    transport: String,
    #[serde(default = "default_keep_alive")]
    keep_alive_seconds: u32,
    #[serde(default = "default_requested_expires")]
    requested_expires_seconds: u32,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RegAccountPayload {
    domain_id: String,
    reg_trunk_id: u64,
    auth_name: String,
    auth_pwd: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RegAccountUpdatePayload {
    reg_trunk_id: u64,
    auth_name: String,
    #[serde(default)]
    auth_pwd: Option<String>,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct InboundRoutePayload {
    domain_id: String,
    name: String,
    #[serde(default)]
    trunk_match: String,
    dst_pattern: String,
    #[serde(default)]
    src_pattern: String,
    #[serde(default)]
    dst_strip: u8,
    #[serde(default)]
    dst_prefix: String,
    #[serde(default)]
    dst_suffix: String,
    #[serde(default)]
    src_strip: u8,
    #[serde(default)]
    src_prefix: String,
    #[serde(default)]
    src_suffix: String,
    target: String,
    #[serde(default = "default_priority")]
    priority: u16,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct InboundRouteUpdatePayload {
    name: String,
    #[serde(default)]
    trunk_match: String,
    dst_pattern: String,
    #[serde(default)]
    src_pattern: String,
    #[serde(default)]
    dst_strip: u8,
    #[serde(default)]
    dst_prefix: String,
    #[serde(default)]
    dst_suffix: String,
    #[serde(default)]
    src_strip: u8,
    #[serde(default)]
    src_prefix: String,
    #[serde(default)]
    src_suffix: String,
    target: String,
    #[serde(default = "default_priority")]
    priority: u16,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RecordingPolicyPayload {
    domain_id: String,
    name: String,
    target_refs: Vec<String>,
    direction: String,
    priority: i32,
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct AiPolicyPayload {
    domain_id: String,
    name: String,
    target_refs: Vec<String>,
    direction: String,
    priority: i32,
    ai_profile_id: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_sip_port() -> u16 {
    5060
}

fn default_transport() -> String {
    "udp".to_string()
}

fn default_keep_alive() -> u32 {
    60
}

fn default_requested_expires() -> u32 {
    300
}

fn default_priority() -> u16 {
    100
}

fn crud(state: &WebState) -> WebConfigCrud {
    WebConfigCrud::new(state.core.clone())
}

fn fields<const N: usize>(fields: [(&str, String); N]) -> BTreeMap<String, String> {
    fields
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

fn peer_trunk_fields(payload: PeerTrunkUpdatePayload) -> BTreeMap<String, String> {
    let mut values = fields([
        ("name", payload.name),
        ("server_host", payload.server_host),
        ("server_port", payload.server_port.to_string()),
        ("outbound_proxy_host", payload.outbound_proxy_host),
        ("transport", payload.transport),
        ("keep_alive_seconds", payload.keep_alive_seconds.to_string()),
        ("enabled", payload.enabled.to_string()),
    ]);
    values.insert(
        "outbound_proxy_port".to_string(),
        payload
            .outbound_proxy_port
            .map(|port| port.to_string())
            .unwrap_or_default(),
    );
    values
}

fn outbound_route_fields(payload: OutboundRouteUpdatePayload) -> BTreeMap<String, String> {
    fields([
        ("name", payload.name),
        ("dst_pattern", payload.dst_pattern),
        ("src_pattern", payload.src_pattern),
        ("dst_strip", payload.dst_strip.to_string()),
        ("dst_prefix", payload.dst_prefix),
        ("dst_suffix", payload.dst_suffix),
        ("src_strip", payload.src_strip.to_string()),
        ("src_prefix", payload.src_prefix),
        ("src_suffix", payload.src_suffix),
        ("trunk_refs", payload.trunk_refs.join(",")),
        ("priority", payload.priority.to_string()),
        ("enabled", payload.enabled.to_string()),
    ])
}

fn reg_trunk_fields(payload: RegTrunkUpdatePayload) -> BTreeMap<String, String> {
    let mut values = fields([
        ("name", payload.name),
        ("server_host", payload.server_host),
        ("server_port", payload.server_port.to_string()),
        ("outbound_proxy_host", payload.outbound_proxy_host),
        ("transport", payload.transport),
        ("keep_alive_seconds", payload.keep_alive_seconds.to_string()),
        (
            "requested_expires_seconds",
            payload.requested_expires_seconds.to_string(),
        ),
        ("enabled", payload.enabled.to_string()),
    ]);
    values.insert(
        "outbound_proxy_port".to_string(),
        payload
            .outbound_proxy_port
            .map(|port| port.to_string())
            .unwrap_or_default(),
    );
    values
}

fn inbound_route_fields(payload: InboundRouteUpdatePayload) -> BTreeMap<String, String> {
    fields([
        ("name", payload.name),
        ("trunk_match", payload.trunk_match),
        ("dst_pattern", payload.dst_pattern),
        ("src_pattern", payload.src_pattern),
        ("dst_strip", payload.dst_strip.to_string()),
        ("dst_prefix", payload.dst_prefix),
        ("dst_suffix", payload.dst_suffix),
        ("src_strip", payload.src_strip.to_string()),
        ("src_prefix", payload.src_prefix),
        ("src_suffix", payload.src_suffix),
        ("target", payload.target),
        ("priority", payload.priority.to_string()),
        ("enabled", payload.enabled.to_string()),
    ])
}

fn recording_policy_fields(payload: RecordingPolicyPayload) -> BTreeMap<String, String> {
    fields([
        ("name", payload.name),
        ("target_refs", payload.target_refs.join(",")),
        ("direction", payload.direction),
        ("priority", payload.priority.to_string()),
        ("enabled", payload.enabled.to_string()),
    ])
}

fn ai_policy_fields(payload: AiPolicyPayload) -> BTreeMap<String, String> {
    fields([
        ("name", payload.name),
        ("target_refs", payload.target_refs.join(",")),
        ("direction", payload.direction),
        ("priority", payload.priority.to_string()),
        ("ai_profile_id", payload.ai_profile_id),
        ("enabled", payload.enabled.to_string()),
    ])
}

impl From<TrunkPayload> for PeerTrunkUpdatePayload {
    fn from(payload: TrunkPayload) -> Self {
        Self {
            name: payload.name,
            server_host: payload.server_host,
            server_port: payload.server_port,
            outbound_proxy_host: payload.outbound_proxy_host,
            outbound_proxy_port: payload.outbound_proxy_port,
            transport: payload.transport,
            keep_alive_seconds: payload.keep_alive_seconds,
            enabled: payload.enabled,
        }
    }
}

impl From<RoutePayload> for OutboundRouteUpdatePayload {
    fn from(payload: RoutePayload) -> Self {
        Self {
            name: payload.name,
            dst_pattern: payload.dst_pattern,
            src_pattern: payload.src_pattern,
            dst_strip: payload.dst_strip,
            dst_prefix: payload.dst_prefix,
            dst_suffix: payload.dst_suffix,
            src_strip: payload.src_strip,
            src_prefix: payload.src_prefix,
            src_suffix: payload.src_suffix,
            trunk_refs: payload.trunk_refs,
            priority: payload.priority,
            enabled: payload.enabled,
        }
    }
}

impl From<RegTrunkPayload> for RegTrunkUpdatePayload {
    fn from(payload: RegTrunkPayload) -> Self {
        Self {
            name: payload.name,
            server_host: payload.server_host,
            server_port: payload.server_port,
            outbound_proxy_host: payload.outbound_proxy_host,
            outbound_proxy_port: payload.outbound_proxy_port,
            transport: payload.transport,
            keep_alive_seconds: payload.keep_alive_seconds,
            requested_expires_seconds: payload.requested_expires_seconds,
            enabled: payload.enabled,
        }
    }
}

impl From<InboundRoutePayload> for InboundRouteUpdatePayload {
    fn from(payload: InboundRoutePayload) -> Self {
        Self {
            name: payload.name,
            trunk_match: payload.trunk_match,
            dst_pattern: payload.dst_pattern,
            src_pattern: payload.src_pattern,
            dst_strip: payload.dst_strip,
            dst_prefix: payload.dst_prefix,
            dst_suffix: payload.dst_suffix,
            src_strip: payload.src_strip,
            src_prefix: payload.src_prefix,
            src_suffix: payload.src_suffix,
            target: payload.target,
            priority: payload.priority,
            enabled: payload.enabled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    #[test]
    fn peer_trunk_fields_include_proxy_values() {
        let values = peer_trunk_fields(PeerTrunkUpdatePayload {
            name: "carrier-a".to_string(),
            server_host: "sip.example.com".to_string(),
            server_port: 5060,
            outbound_proxy_host: "proxy.example.com".to_string(),
            outbound_proxy_port: Some(5080),
            transport: "tcp".to_string(),
            keep_alive_seconds: 30,
            enabled: true,
        });

        assert_eq!(values["outbound_proxy_host"], "proxy.example.com");
        assert_eq!(values["outbound_proxy_port"], "5080");
    }

    #[test]
    fn outbound_route_fields_preserve_transform_and_trunk_order() {
        let values = outbound_route_fields(OutboundRouteUpdatePayload {
            name: "pstn".to_string(),
            dst_pattern: "^9(.+)$".to_string(),
            src_pattern: "^1001$".to_string(),
            dst_strip: 1,
            dst_prefix: "86".to_string(),
            dst_suffix: "#".to_string(),
            src_strip: 2,
            src_prefix: "021".to_string(),
            src_suffix: "0".to_string(),
            trunk_refs: vec!["peer:2".to_string(), "reg:3/4".to_string()],
            priority: 20,
            enabled: true,
        });

        assert_eq!(values["dst_strip"], "1");
        assert_eq!(values["src_prefix"], "021");
        assert_eq!(values["trunk_refs"], "peer:2,reg:3/4");
    }

    #[test]
    fn inbound_route_fields_include_transform_values() {
        let values = inbound_route_fields(InboundRouteUpdatePayload {
            name: "did".to_string(),
            trunk_match: "peer:2".to_string(),
            dst_pattern: "^4000$".to_string(),
            src_pattern: String::new(),
            dst_strip: 1,
            dst_prefix: "8".to_string(),
            dst_suffix: String::new(),
            src_strip: 0,
            src_prefix: String::new(),
            src_suffix: String::new(),
            target: "ext-1001".to_string(),
            priority: 10,
            enabled: true,
        });

        assert_eq!(values["trunk_match"], "peer:2");
        assert_eq!(values["dst_prefix"], "8");
        assert_eq!(values["target"], "ext-1001");
    }

    #[test]
    fn recording_policy_fields_preserve_mixed_target_order() {
        let values = recording_policy_fields(RecordingPolicyPayload {
            domain_id: "domain-a".to_string(),
            name: "mixed".to_string(),
            target_refs: vec![
                "ext:1".to_string(),
                "peer:2".to_string(),
                "reg:3".to_string(),
            ],
            direction: "both".to_string(),
            priority: 10,
            enabled: true,
        });

        assert_eq!(values["target_refs"], "ext:1,peer:2,reg:3");
    }

    #[test]
    fn ai_policy_fields_include_profile_and_mixed_target_order() {
        let values = ai_policy_fields(AiPolicyPayload {
            domain_id: "domain-a".to_string(),
            name: "after-call-summary".to_string(),
            target_refs: vec![
                "ext:1".to_string(),
                "peer:2".to_string(),
                "reg:3".to_string(),
            ],
            direction: "inbound".to_string(),
            priority: 30,
            ai_profile_id: "volcengine-default".to_string(),
            enabled: true,
        });

        assert_eq!(values["target_refs"], "ext:1,peer:2,reg:3");
        assert_eq!(values["ai_profile_id"], "volcengine-default");
        assert_eq!(values["direction"], "inbound");
    }

    #[tokio::test]
    async fn serves_registration_index_module() {
        let response = static_core_js_file(Path("registrations.js".to_string())).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "application/javascript; charset=utf-8"
        );
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("export function findRegistration")
        );
    }

    #[tokio::test]
    async fn serves_supported_i18n_resources() {
        for file in ["zh-CN.json", "en-US.json"] {
            let response = i18n_file(Path(file.to_string())).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                response.headers()["content-type"],
                "application/json; charset=utf-8"
            );
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert!(std::str::from_utf8(&body).unwrap().contains("login.submit"));
        }
    }

    #[tokio::test]
    async fn serves_recording_view_module() {
        let response = static_view_js_file(Path("recording.js".to_string())).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "application/javascript; charset=utf-8"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("export function createRecordingView")
        );
    }

    #[tokio::test]
    async fn serves_ai_view_module() {
        let response = static_view_js_file(Path("ai.js".to_string())).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "application/javascript; charset=utf-8"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("export function createAiView")
        );
    }

    #[tokio::test]
    async fn serves_users_view_module() {
        let response = static_view_js_file(Path("users.js".to_string())).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "application/javascript; charset=utf-8"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("export function createUsersView")
        );
    }

    #[test]
    fn domain_scope_enforces_principal_grants() {
        let auth = AuthSession {
            token: "token".to_string(),
            principal: Principal {
                user_id: 2,
                username: "alice".to_string(),
                role: "domain_admin".to_string(),
                enabled: true,
                domain_ids: vec!["domain-a".to_string()],
                auth_source: "web_user".to_string(),
            },
        };
        assert_eq!(
            scoped_domain(&auth, Some("domain-a".to_string()), true).unwrap(),
            Some("domain-a".to_string())
        );
        assert!(scoped_domain(&auth, Some("domain-b".to_string()), true).is_err());
        assert_eq!(
            scoped_domain(&auth, None, true).unwrap(),
            Some("domain-a".to_string())
        );
    }

    #[test]
    fn parses_single_and_suffix_recording_ranges() {
        assert_eq!(parse_range(None, 100).unwrap(), None);
        assert_eq!(
            parse_range(
                Some(&axum::http::HeaderValue::from_static("bytes=10-19")),
                100
            )
            .unwrap(),
            Some((10, 19))
        );
        assert_eq!(
            parse_range(
                Some(&axum::http::HeaderValue::from_static("bytes=-10")),
                100
            )
            .unwrap(),
            Some((90, 99))
        );
        assert!(
            parse_range(
                Some(&axum::http::HeaderValue::from_static("bytes=100-")),
                100
            )
            .is_err()
        );
    }
}
