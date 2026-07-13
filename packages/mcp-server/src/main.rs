use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::BufRead;
use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tokio::sync::{mpsc, oneshot};
use tracing::info;

pub const LOG_SERVER_START: &str = "loki-auto Open-Source MCP Server initialized on 127.0.0.1";

const RHAI_DOCUMENTATION: &str = r#"
# loki-auto Rhai Sandbox API Reference Guide

This document defines the complete API specifications and best practices for writing Rhai automation scripts to execute inside the Loki browser sandbox.

## Key Design Principles
1. **Synchronous Execution**: All APIs inside the sandbox are **SYNCHRONOUS** and blocking. **DO NOT** use the `await` keyword in your Rhai scripts.
2. **Inherited Browser Context**: The execution sandbox runs in the active browser tab, inheriting logged-in sessions, cookies, and local credentials. No login actions are usually needed.

## Rhai API List

* `sleep(ms: i64)`
  - Suspends execution for the specified milliseconds.
  
* `log(message: Any)`
  - Prints a message to the Execution Console logs. Supports strings, numbers, booleans, and other objects.
  
* `dom_to_string() -> String`
  - Returns a cleaned, token-optimized (AEO-optimized) HTML tree of the current page. Ideal for LLM analysis.
  
* `element_exists(selector: String) -> bool`
  - Immediate check if a element matches the CSS selector in the page.
  
* `wait_element(selector: String, [timeout_ms: i64]) -> bool`
  - Blocks until the element is present in the DOM, or throws a `TimeoutError`. Default timeout: 5000 ms.
  
* `click(selector: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then clicks on it. Default timeout: 5000 ms.
  
* `type_text(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then instantly sets its value. Triggers standard input/change events. Recommended for large texts, pasting articles, or generic forms. Default timeout: 5000 ms.
  
* `type_as_human(selector: String, text: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then types character-by-character with randomized human typing delays (40ms-120ms) and standard keydown/keyup events. Recommended for search inputs, login credentials, and bypassing anti-bot systems. Default timeout: 5000 ms.
  
* `get_text(selector: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts its text content. Default timeout: 5000 ms.
  
* `get_value(selector: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts its input value. Default timeout: 5000 ms.
  
* `get_attribute(selector: String, attr: String, [timeout_ms: i64]) -> String`
  - Waits for the element, then extracts the value of the specified attribute. Default timeout: 5000 ms.
  
* `scroll_to(selector: String, [timeout_ms: i64]) -> bool`
  - Waits for the element, then scrolls the viewport smoothly to align it in the center. Default timeout: 5000 ms.
  
* `get_loki_data(dom_selector: String, [timeout_ms: i64]) -> String`
  - Scopes the target element, queries all child elements bearing `data-loki` attributes, and returns a clean, Markdown-friendly outline description. Default timeout: 5000 ms.

## Code Examples

### Example 1: Google Search with Human Typing
```rust
print("Waiting for search box...");
if wait_element("textarea[name='q']", 3000) {
  // Use type_as_human to simulate real typing
  type_as_human("textarea[name='q']", "weather in Boston today");
  sleep(500);
  click("input[name='btnK']");
}
```

### Example 2: Parsing lazy loaded listings with scrolling
```rust
print("Scrolling to bottom to load more items...");
scroll_to("footer");
sleep(1500); // Wait for content load
let page_html = dom_to_string();
print("DOM size loaded: " + page_html.len());
```

## ❓ Help & Resources
For more details, advanced scripting guides, and integration tutorials, please visit our help center:
👉 https://loki4agent.com/docs/help
"#;



#[derive(Deserialize)]
struct Config {
    server: ServerConfig,
}

#[derive(Deserialize)]
struct ServerConfig {
    port: u16,
    host: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OneshotTaskInput {
    pub task_id: String,
    pub target_tab_id: Option<i32>,
    pub target_url_pattern: Option<String>,
    pub rhai_script: String,
    pub payload: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OneshotTaskOutput {
    pub task_id: String,
    pub success: bool,
    pub data: serde_json::Value,
    pub logs: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum WsMessageToExtension {
    #[serde(rename = "LOKI_EXECUTE_ONESHOT")]
    ExecuteOneshot(OneshotTaskInput),
    #[serde(rename = "LOKI_OPEN_TAB")]
    OpenTab { url: String, active: bool, task_id: String },
    #[serde(rename = "LOKI_CLOSE_TAB")]
    CloseTab { tab_id: i32, task_id: String },
    #[serde(rename = "LOKI_ACTIVATE_TAB")]
    ActivateTab { tab_id: i32, task_id: String },
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum WsMessageFromExtension {
    #[serde(rename = "LOKI_EXECUTE_ONESHOT_RESPONSE")]
    ExecuteOneshotResponse(OneshotTaskOutput),
    #[serde(rename = "LOKI_COMMAND_RESPONSE")]
    CommandResponse { task_id: String, success: bool, data: serde_json::Value },
    #[serde(rename = "LOKI_TAB_LIST_UPDATE")]
    TabListUpdate { tabs: Vec<serde_json::Value> },
}

struct AppState {
    pending_tasks: Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>,
    ws_sender: Mutex<Option<mpsc::UnboundedSender<Message>>>,
    active_tabs: Mutex<Vec<serde_json::Value>>,
    task_counter: AtomicU64,
}

fn load_port() -> u16 {
    if let Ok(config_str) = std::fs::read_to_string("packages/mcp-server/config.toml") {
        if let Ok(config) = toml::from_str::<Config>(&config_str) {
            return config.server.port;
        }
    }
    if let Ok(config_str) = std::fs::read_to_string("config.toml") {
        if let Ok(config) = toml::from_str::<Config>(&config_str) {
            return config.server.port;
        }
    }
    10402
}

#[tokio::main]
async fn main() {
    // Stdio MCP protocol requires logs to go to stderr so stdout remains clean
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();

    let port = load_port();
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let state = Arc::new(AppState {
        pending_tasks: Mutex::new(HashMap::new()),
        ws_sender: Mutex::new(None),
        active_tabs: Mutex::new(Vec::new()),
        task_counter: AtomicU64::new(0),
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state.clone());

    // Start Axum server in a background thread
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    info!("Starting Axum WebSocket gateway on {}", addr);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Output server startup log to stderr
    eprintln!("{} on port {}", LOG_SERVER_START, port);

    // Stdio MCP JSON-RPC loop on the main thread
    run_mcp_loop(state).await;
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<AppState>) {
    let (mut ws_sender_stream, mut ws_receiver_stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register active WebSocket sender
    {
        let mut sender_guard = state.ws_sender.lock().unwrap();
        *sender_guard = Some(tx);
    }
    info!("Browser Extension connected to WS gateway.");

    // Task to forward outgoing messages to WebSocket
    let mut ws_sender_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if ws_sender_stream.send(message).await.is_err() {
                break;
            }
        }
    });

    // Task to handle incoming messages from WebSocket
    let state_clone = state.clone();
    let mut ws_receiver_task = tokio::spawn(async move {
        while let Some(Ok(message)) = ws_receiver_stream.next().await {
            if let Message::Text(text) = message {
                if let Ok(msg) = serde_json::from_str::<WsMessageFromExtension>(&text) {
                    match msg {
                        WsMessageFromExtension::ExecuteOneshotResponse(output) => {
                            let mut tasks_guard = state_clone.pending_tasks.lock().unwrap();
                            if let Some(sender) = tasks_guard.remove(&output.task_id) {
                                let _ = sender.send(serde_json::to_value(&output).unwrap());
                            }
                        }
                        WsMessageFromExtension::CommandResponse { task_id, success, data } => {
                            let mut tasks_guard = state_clone.pending_tasks.lock().unwrap();
                            if let Some(sender) = tasks_guard.remove(&task_id) {
                                let _ = sender.send(json!({ "success": success, "data": data }));
                            }
                        }
                        WsMessageFromExtension::TabListUpdate { tabs } => {
                            let mut tabs_guard = state_clone.active_tabs.lock().unwrap();
                            *tabs_guard = tabs;
                        }
                    }
                }
            }
        }
    });

    // Wait until connection closes
    tokio::select! {
        _ = &mut ws_sender_task => {}
        _ = &mut ws_receiver_task => {}
    }

    // Deregister WebSocket sender
    {
        let mut sender_guard = state.ws_sender.lock().unwrap();
        *sender_guard = None;
    }
    info!("Browser Extension disconnected.");
}

async fn run_mcp_loop(state: Arc<AppState>) {
    let stdin = std::io::stdin();
    let mut reader = std::io::BufReader::new(stdin);
    let mut line = String::new();

    while let Ok(bytes_read) = reader.read_line(&mut line) {
        if bytes_read == 0 {
            break; // EOF
        }

        if let Ok(req) = serde_json::from_str::<serde_json::Value>(&line) {
            let id = req.get("id").cloned().unwrap_or(serde_json::Value::Null);
            let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");

            match method {
                "initialize" => {
                    let response = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {
                                "tools": {}
                            },
                            "serverInfo": {
                                "name": "loki-mcp-server",
                                "version": "0.1.1"
                            }
                        }
                    });
                    send_mcp_response(response);
                }
                "tools/list" => {
                    let response = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "tools": [
                                {
                                    "name": "list_tabs",
                                    "description": "Lists all open browser tabs and their status.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {}
                                    }
                                },
                                {
                                    "name": "open_tab",
                                    "description": "Opens a new browser tab with the specified URL.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {
                                            "url": { "type": "string", "description": "The destination URL" },
                                            "active": { "type": "boolean", "description": "Whether to focus the tab immediately", "default": true }
                                        },
                                        "required": ["url"]
                                    }
                                },
                                {
                                    "name": "close_tab",
                                    "description": "Closes the target browser tab.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {
                                            "tab_id": { "type": "integer", "description": "The Chrome Tab ID to close" }
                                        },
                                        "required": ["tab_id"]
                                    }
                                },
                                {
                                    "name": "activate_tab",
                                    "description": "Focuses and brings the target browser tab to foreground.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {
                                            "tab_id": { "type": "integer", "description": "The Chrome Tab ID to activate" }
                                        },
                                        "required": ["tab_id"]
                                    }
                                },
                                {
                                    "name": "execute_loki_oneshot",
                                    "description": "Executes a Rhai automation script synchronously inside a sandboxed VM in the browser.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {
                                            "target_tab_id": { "type": "integer", "description": "Optionally specify Chrome Tab ID" },
                                            "target_url_pattern": { "type": "string", "description": "Optionally specify URL wildcard match pattern" },
                                            "rhai_script": { "type": "string", "description": "The Rhai script to execute" },
                                            "payload": { "type": "object", "description": "JSON payload variables injected as constant 'payload'" }
                                        },
                                        "required": ["rhai_script"]
                                    }
                                },
                                {
                                    "name": "get_rhai_documentation",
                                    "description": "Returns the complete developer reference guide and API specifications for writing Rhai automation scripts inside the Loki browser sandbox.",
                                    "inputSchema": {
                                        "type": "object",
                                        "properties": {}
                                    }
                                }
                            ]
                        }
                    });
                    send_mcp_response(response);
                }
                "tools/call" => {
                    let params = req.get("params").cloned().unwrap_or(serde_json::Value::Null);
                    let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

                    let state_clone = state.clone();
                    let id_clone = id.clone();
                    let tool_name_str = tool_name.to_string();

                    tokio::spawn(async move {
                        let result = handle_tool_call(state_clone, &tool_name_str, arguments).await;
                        match result {
                            Ok(res_val) => {
                                send_mcp_response(json!({
                                    "jsonrpc": "2.0",
                                    "id": id_clone,
                                    "result": {
                                        "content": [
                                            {
                                                "type": "text",
                                                "text": serde_json::to_string_pretty(&res_val).unwrap_or_default()
                                            }
                                        ]
                                    }
                                }));
                            }
                            Err(err_msg) => {
                                send_mcp_response(json!({
                                    "jsonrpc": "2.0",
                                    "id": id_clone,
                                    "error": {
                                        "code": -32603,
                                        "message": err_msg
                                    }
                                }));
                            }
                        }
                    });
                }
                _ => {
                    // Method not found or generic response
                    if !id.is_null() {
                        send_mcp_response(json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": {
                                "code": -32601,
                                "message": format!("Method '{}' not found", method)
                            }
                        }));
                    }
                }
            }
        }

        line.clear();
    }
}

fn send_mcp_response(response: serde_json::Value) {
    let out = serde_json::to_string(&response).unwrap();
    // Output strictly to stdout for Stdio MCP client parsing
    println!("{}", out);
    use std::io::Write;
    std::io::stdout().flush().unwrap();
}

async fn handle_tool_call(
    state: Arc<AppState>,
    tool_name: &str,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match tool_name {
        "list_tabs" => {
            let tabs = state.active_tabs.lock().unwrap().clone();
            Ok(json!({ "tabs": tabs }))
        }
        "open_tab" => {
            let url = arguments.get("url").and_then(|u| u.as_str()).ok_or("Missing 'url' parameter")?;
            let active = arguments.get("active").and_then(|a| a.as_bool()).unwrap_or(true);
            let task_id = format!("cmd_{}", state.task_counter.fetch_add(1, Ordering::SeqCst));

            let rx = register_pending_task(&state, &task_id).await;
            send_ws_message(&state, WsMessageToExtension::OpenTab {
                url: url.to_string(),
                active,
                task_id: task_id.clone(),
            })?;

            await_response(rx).await
        }
        "close_tab" => {
            let tab_id = arguments.get("tab_id").and_then(|t| t.as_i64()).ok_or("Missing 'tab_id' parameter")? as i32;
            let task_id = format!("cmd_{}", state.task_counter.fetch_add(1, Ordering::SeqCst));

            let rx = register_pending_task(&state, &task_id).await;
            send_ws_message(&state, WsMessageToExtension::CloseTab {
                tab_id,
                task_id: task_id.clone(),
            })?;

            await_response(rx).await
        }
        "activate_tab" => {
            let tab_id = arguments.get("tab_id").and_then(|t| t.as_i64()).ok_or("Missing 'tab_id' parameter")? as i32;
            let task_id = format!("cmd_{}", state.task_counter.fetch_add(1, Ordering::SeqCst));

            let rx = register_pending_task(&state, &task_id).await;
            send_ws_message(&state, WsMessageToExtension::ActivateTab {
                tab_id,
                task_id: task_id.clone(),
            })?;

            await_response(rx).await
        }
        "execute_loki_oneshot" => {
            let target_tab_id = arguments.get("target_tab_id").and_then(|t| t.as_i64()).map(|t| t as i32);
            let target_url_pattern = arguments.get("target_url_pattern").and_then(|u| u.as_str()).map(|s| s.to_string());
            let rhai_script = arguments.get("rhai_script").and_then(|s| s.as_str()).ok_or("Missing 'rhai_script' parameter")?;
            let payload = arguments.get("payload").cloned().unwrap_or(json!({}));
            let task_id = format!("task_{}", state.task_counter.fetch_add(1, Ordering::SeqCst));

            let rx = register_pending_task(&state, &task_id).await;
            send_ws_message(&state, WsMessageToExtension::ExecuteOneshot(OneshotTaskInput {
                task_id: task_id.clone(),
                target_tab_id,
                target_url_pattern,
                rhai_script: rhai_script.to_string(),
                payload,
            }))?;

            await_response(rx).await
        }
        "get_rhai_documentation" => {
            Ok(json!({ "documentation": RHAI_DOCUMENTATION }))
        }
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

async fn register_pending_task(
    state: &AppState,
    task_id: &str,
) -> oneshot::Receiver<serde_json::Value> {
    let (tx, rx) = oneshot::channel::<serde_json::Value>();
    let mut tasks_guard = state.pending_tasks.lock().unwrap();
    tasks_guard.insert(task_id.to_string(), tx);
    rx
}

fn send_ws_message(state: &AppState, ws_msg: WsMessageToExtension) -> Result<(), String> {
    let sender_guard = state.ws_sender.lock().unwrap();
    if let Some(ref sender) = *sender_guard {
        let serialized = serde_json::to_string(&ws_msg).map_err(|e| e.to_string())?;
        sender
            .send(Message::Text(serialized))
            .map_err(|e| format!("Failed to send to extension: {}", e))?;
        Ok(())
    } else {
        Err("No browser extension is currently connected to the server. Make sure extension is open and connected.".to_string())
    }
}

async fn await_response(rx: oneshot::Receiver<serde_json::Value>) -> Result<serde_json::Value, String> {
    // Await response with a timeout (e.g. 45 seconds)
    tokio::select! {
        res = rx => {
            res.map_err(|e| format!("Channel error: {}", e))
        }
        _ = tokio::time::sleep(tokio::time::Duration::from_secs(45)) => {
            Err("Timeout waiting for Browser Extension to respond.".to_string())
        }
    }
}
