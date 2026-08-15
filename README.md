# VoIPSwitch Web

VoIPSwitch 的 Web 管理服务。`vs_web` 提供管理 API 和内嵌静态界面，并通过本地控制 socket
访问 VoIPSwitch Core。

## 构建

需要 Rust stable 工具链。由于 workspace 使用本地路径依赖，默认目录布局要求
`voipswitch-web` 与 `voipswitch-core` 位于同一父目录。

```bash
cargo build --workspace
```

## 运行

先启动 `voipswitchd`，再启动 Web 服务：

```bash
cargo run -p vs_web
```

服务默认监听 `0.0.0.0:18081`。可通过参数覆盖监听地址或控制 socket：

```bash
cargo run -p vs_web -- --bind 127.0.0.1:18081 \
  --control-socket /tmp/voipswitch/control.sock
```

使用 `--help` 查看完整运行参数。

## 前端资源

静态资源位于 `crates/vs_web/static/`。界面文案通过 `static/i18n/` 下的语言资源维护，
新增文案时应同步更新中文和英文资源。

## 验证

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
node --test tests/*.test.mjs
```
