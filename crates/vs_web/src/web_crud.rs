use crate::core_client::{CoreClient, CoreExecution};
use anyhow::{Result, anyhow};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use voipswitch_core::command_service::{Command, CommandRenderData, CommandResult, ConfigCommand};
use voipswitch_core::types::ids::DomainId;

#[derive(Debug, Clone)]
pub struct WebConfigCrud {
    core: CoreClient,
}

#[derive(Debug, Clone, Copy)]
pub enum WebTable {
    Domain,
    Ext,
    PeerTrunk,
    RegTrunk,
    RegAccount,
    InboundRoute,
    OutboundRoute,
    RecordingPolicy,
    AiPolicy,
    AiAgent,
}

#[derive(Debug, Clone, Copy)]
pub struct PageParams {
    pub page: usize,
    pub page_size: usize,
}

impl WebTable {
    fn name(self) -> &'static str {
        match self {
            Self::Domain => "domain",
            Self::Ext => "ext",
            Self::PeerTrunk => "peer_trunk",
            Self::RegTrunk => "reg_trunk",
            Self::RegAccount => "reg_account",
            Self::InboundRoute => "inbound_route",
            Self::OutboundRoute => "outbound_route",
            Self::RecordingPolicy => "recording_policy",
            Self::AiPolicy => "ai_policy",
            Self::AiAgent => "ai_agent",
        }
    }

    fn collection_name(self) -> &'static str {
        match self {
            Self::Domain => "domains",
            Self::Ext => "extensions",
            Self::PeerTrunk => "peer_trunks",
            Self::RegTrunk => "reg_trunks",
            Self::RegAccount => "reg_accounts",
            Self::InboundRoute => "inbound_routes",
            Self::OutboundRoute => "outbound_routes",
            Self::RecordingPolicy => "recording_policies",
            Self::AiPolicy => "ai_policies",
            Self::AiAgent => "ai_agents",
        }
    }
}

impl WebConfigCrud {
    pub fn new(core: CoreClient) -> Self {
        Self { core }
    }

    pub async fn select_collection(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        cond: Option<String>,
        keys: Option<Vec<&str>>,
        page: Option<PageParams>,
    ) -> Result<CoreExecution> {
        let execution = self.select(table, domain_id, cond, keys, page).await?;
        let rows = extract_rows(&execution.result)?;
        let pagination = extract_pagination(&execution.result);
        let CommandResult {
            code,
            message,
            warnings,
            ..
        } = execution.result;
        Ok(CoreExecution {
            request_id: execution.request_id,
            result: CommandResult {
                code,
                message,
                data: CommandRenderData::Object {
                    value: json!({
                        "resource": "vc_config",
                        "action": "select",
                        "data": {
                            table.collection_name(): rows,
                            "pagination": pagination,
                        },
                    }),
                },
                warnings,
            },
        })
    }

    pub async fn select(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        cond: Option<String>,
        keys: Option<Vec<&str>>,
        page: Option<PageParams>,
    ) -> Result<CoreExecution> {
        let mut fields = BTreeMap::new();
        fields.insert("table".to_string(), table.name().to_string());
        if let Some(cond) = cond {
            fields.insert("cond".to_string(), cond);
        }
        if let Some(keys) = keys {
            fields.insert("keys".to_string(), keys.join(","));
        }
        if let Some(page) = page {
            fields.insert("page".to_string(), page.page.to_string());
            fields.insert("page-size".to_string(), page.page_size.to_string());
        }
        self.execute("select", table, domain_id, fields).await
    }

    pub async fn insert(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        mut fields: BTreeMap<String, String>,
    ) -> Result<CoreExecution> {
        fields.insert("table".to_string(), table.name().to_string());
        self.execute("insert", table, domain_id, fields).await
    }

    pub async fn batch_insert(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        records: Value,
    ) -> Result<CoreExecution> {
        let mut fields = BTreeMap::new();
        fields.insert("table".to_string(), table.name().to_string());
        fields.insert("records".to_string(), serde_json::to_string(&records)?);
        self.execute("batch_insert", table, domain_id, fields).await
    }

    pub async fn update(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        cond: String,
        mut fields: BTreeMap<String, String>,
    ) -> Result<CoreExecution> {
        fields.insert("table".to_string(), table.name().to_string());
        fields.insert("cond".to_string(), cond);
        self.execute("update", table, domain_id, fields).await
    }

    pub async fn delete(
        &self,
        table: WebTable,
        domain_id: Option<DomainId>,
        cond: String,
    ) -> Result<CoreExecution> {
        let mut fields = BTreeMap::new();
        fields.insert("table".to_string(), table.name().to_string());
        fields.insert("cond".to_string(), cond);
        self.execute("delete", table, domain_id, fields).await
    }

    async fn execute(
        &self,
        action: &str,
        table: WebTable,
        domain_id: Option<DomainId>,
        fields: BTreeMap<String, String>,
    ) -> Result<CoreExecution> {
        self.core
            .execute(Command::Config(ConfigCommand {
                resource: "vc_config".to_string(),
                action: action.to_string(),
                domain_id,
                key: Some(table.name().to_string()),
                fields,
            }))
            .await
    }
}

fn extract_pagination(result: &CommandResult) -> Value {
    match &result.data {
        CommandRenderData::Object { value } => value
            .get("data")
            .and_then(|data| data.get("pagination"))
            .cloned()
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

pub fn cond_eq(field: &str, value: &str) -> String {
    format!("{field}={value}")
}

fn extract_rows(result: &CommandResult) -> Result<Vec<Value>> {
    match &result.data {
        CommandRenderData::Object { value } => value
            .get("data")
            .and_then(|data| data.get("rows"))
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| anyhow!("vc_config select result did not contain rows")),
        CommandRenderData::Table { columns, rows } => Ok(rows
            .iter()
            .map(|row| {
                let mut object = serde_json::Map::new();
                for (index, column) in columns.iter().enumerate() {
                    object.insert(
                        column.clone(),
                        row.get(index).cloned().unwrap_or(Value::Null),
                    );
                }
                Value::Object(object)
            })
            .collect()),
        _ => Err(anyhow!("vc_config select returned non-tabular result")),
    }
}
