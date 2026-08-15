mod auth;
mod core_client;
mod handlers;
mod logging;
mod web_crud;

use anyhow::Result;
use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

use crate::core_client::CoreClient;

#[derive(Debug, Parser)]
#[command(name = "vs_web")]
#[command(about = "VoIPSwitch web management service")]
struct Args {
    #[arg(long, default_value = "0.0.0.0:18081")]
    bind: SocketAddr,

    #[arg(long)]
    control_socket: Option<PathBuf>,

    #[arg(long)]
    log_dir: Option<PathBuf>,
}

#[derive(Clone)]
pub struct WebState {
    core: CoreClient,
    sessions: auth::SessionStore,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let log_dir = logging::resolve_log_dir(args.log_dir.clone());
    let _log_guard = logging::init(&log_dir)?;
    let control_socket = args
        .control_socket
        .unwrap_or_else(|| default_socket_path("control.sock"));

    let state = WebState {
        core: CoreClient::new(control_socket),
        sessions: auth::SessionStore::default(),
    };
    let app = handlers::router().with_state(Arc::new(state));
    let listener = TcpListener::bind(args.bind).await?;

    info!(bind = %args.bind, log_dir = %log_dir.display(), "vs_web listening");
    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn default_socket_path(file_name: &str) -> PathBuf {
    if let Some(runtime_dir) = std::env::var_os("XDG_RUNTIME_DIR") {
        return PathBuf::from(runtime_dir)
            .join("voipswitch")
            .join(file_name);
    }
    PathBuf::from("/tmp/voipswitch").join(file_name)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
