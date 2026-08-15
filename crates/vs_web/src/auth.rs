use crate::WebState;
use async_trait::async_trait;
use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use voipswitch_core::types::time::unix_timestamp_ms;

pub const SESSION_COOKIE: &str = "vs_session";
const SESSION_TTL: Duration = Duration::from_secs(8 * 60 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Principal {
    pub user_id: i64,
    pub username: String,
    pub role: String,
    pub enabled: bool,
    pub domain_ids: Vec<String>,
    #[serde(default = "default_auth_source")]
    pub auth_source: String,
}

impl Principal {
    pub fn is_system_admin(&self) -> bool {
        self.role == "system_admin"
    }

    pub fn can_access_domain(&self, domain_id: &str) -> bool {
        self.is_system_admin() || self.domain_ids.iter().any(|value| value == domain_id)
    }
}

#[derive(Debug, Clone)]
pub struct AuthSession {
    pub token: String,
    pub principal: Principal,
}

#[derive(Clone)]
struct SessionEntry {
    principal: Principal,
    expires_at: Instant,
}

#[derive(Clone, Default)]
pub struct SessionStore {
    entries: Arc<Mutex<HashMap<String, SessionEntry>>>,
}

impl SessionStore {
    pub fn issue(&self, principal: Principal) -> String {
        let mut random = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut random);
        let token = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        self.entries
            .lock()
            .expect("session store lock poisoned")
            .insert(
                token.clone(),
                SessionEntry {
                    principal,
                    expires_at: Instant::now() + SESSION_TTL,
                },
            );
        token
    }

    pub fn get(&self, token: &str) -> Option<Principal> {
        let mut entries = self.entries.lock().expect("session store lock poisoned");
        let expired = entries
            .get(token)
            .is_some_and(|entry| entry.expires_at <= Instant::now());
        if expired {
            entries.remove(token);
            return None;
        }
        entries.get(token).map(|entry| entry.principal.clone())
    }

    pub fn revoke(&self, token: &str) {
        self.entries
            .lock()
            .expect("session store lock poisoned")
            .remove(token);
    }

    pub fn revoke_user(&self, user_id: i64, except_token: Option<&str>) {
        self.entries
            .lock()
            .expect("session store lock poisoned")
            .retain(|token, entry| {
                entry.principal.user_id != user_id || except_token == Some(token.as_str())
            });
    }

    pub fn revoke_domain_login(&self, domain_id: &str) {
        self.entries
            .lock()
            .expect("session store lock poisoned")
            .retain(|_, entry| {
                entry.principal.auth_source != "domain"
                    || entry.principal.domain_ids.len() != 1
                    || entry.principal.domain_ids.first().map(String::as_str) != Some(domain_id)
            });
    }
}

fn default_auth_source() -> String {
    "web_user".to_string()
}

#[async_trait]
impl FromRequestParts<Arc<WebState>> for AuthSession {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<WebState>,
    ) -> Result<Self, Self::Rejection> {
        let Some(token) = cookie_value(&parts.headers, SESSION_COOKIE) else {
            return Err(auth_error(
                StatusCode::UNAUTHORIZED,
                "AUTH_REQUIRED",
                "login required",
            ));
        };
        let Some(principal) = state.sessions.get(&token) else {
            return Err(auth_error(
                StatusCode::UNAUTHORIZED,
                "AUTH_REQUIRED",
                "login required",
            ));
        };
        Ok(Self { token, principal })
    }
}

pub fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(key, value)| (key == name).then(|| value.to_string()))
}

pub fn session_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
        SESSION_TTL.as_secs()
    )
}

pub fn expired_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
}

pub fn auth_error(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(json!({
            "ok": false,
            "error": {
                "request_id": format!("web-{}", unix_timestamp_ms()),
                "code": code,
                "message": message,
                "data": {},
                "warnings": [],
            }
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn principal() -> Principal {
        Principal {
            user_id: 2,
            username: "alice".to_string(),
            role: "domain_admin".to_string(),
            enabled: true,
            domain_ids: vec!["domain-a".to_string(), "domain-b".to_string()],
            auth_source: "web_user".to_string(),
        }
    }

    #[test]
    fn sessions_are_random_and_revocable() {
        let store = SessionStore::default();
        let first = store.issue(principal());
        let second = store.issue(principal());
        assert_ne!(first, second);
        assert_eq!(store.get(&first).unwrap().username, "alice");
        store.revoke(&first);
        assert!(store.get(&first).is_none());
    }

    #[test]
    fn principal_checks_domain_grants() {
        let user = principal();
        assert!(user.can_access_domain("domain-a"));
        assert!(!user.can_access_domain("domain-c"));
    }

    #[test]
    fn domain_login_sessions_can_be_revoked_by_domain() {
        let store = SessionStore::default();
        let mut domain_user = principal();
        domain_user.user_id = 0;
        domain_user.domain_ids = vec!["domain-a".to_string()];
        domain_user.auth_source = "domain".to_string();
        let token = store.issue(domain_user);
        store.revoke_domain_login("domain-a");
        assert!(store.get(&token).is_none());
    }
}
