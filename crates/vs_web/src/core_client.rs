use anyhow::{Result, bail};
use std::path::PathBuf;
use std::{error::Error, fmt};
use tokio::net::UnixStream;
use voipswitch_core::command_service::{Command, CommandRequest, CommandResponse, CommandResult};
use voipswitch_core::ipc::server::send_command;
use voipswitch_core::types::time::unix_timestamp_ms;

#[derive(Debug, Clone)]
pub struct CoreExecution {
    pub request_id: String,
    pub result: CommandResult,
}

#[derive(Debug, Clone)]
pub struct CoreCommandError {
    pub request_id: String,
    pub code: String,
    pub message: String,
}

impl fmt::Display for CoreCommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl Error for CoreCommandError {}

#[derive(Debug, Clone)]
pub struct CoreClient {
    socket: PathBuf,
}

impl CoreClient {
    pub fn new(socket: PathBuf) -> Self {
        Self { socket }
    }

    pub async fn execute(&self, command: Command) -> Result<CoreExecution> {
        let stream = UnixStream::connect(&self.socket).await?;
        let response = send_command(
            stream,
            CommandRequest::parsed(format!("web-{}", unix_timestamp_ms()), command),
        )
        .await?;
        command_result(response)
    }
}

fn command_result(response: CommandResponse) -> Result<CoreExecution> {
    if response.ok {
        return Ok(CoreExecution {
            request_id: response.request_id,
            result: response
                .result
                .ok_or_else(|| anyhow::anyhow!("empty command result"))?,
        });
    }

    if let Some(error) = response.error {
        return Err(anyhow::Error::new(CoreCommandError {
            request_id: response.request_id,
            code: error.code,
            message: error.message,
        }));
    }
    bail!("command failed")
}
