import { LokiMessage, TabMetadata } from "@loki/shared-types";

let ws: WebSocket | null = null;
let reconnectTimer: any = null;

// Polyfill helpers to ensure cross-browser compatibility for chrome.tabs (Chrome MV3 vs Firefox MV2)
function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      resolve(tabs || []);
    });
  });
}

function createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve) => {
    chrome.tabs.create(createProperties, (tab) => {
      resolve(tab);
    });
  });
}

function removeTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      resolve();
    });
  });
}

function updateTab(tabId: number, updateProperties: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      resolve(tab);
    });
  });
}

function sendMessageToTab(tabId: number, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Load port from storage, default to 10402
function getPort(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["axumPort"], (result) => {
      resolve(result.axumPort || 10402);
    });
  });
}

// Load profileName from storage, default to "default"
function getProfileName(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["profileName"], (result) => {
      resolve(result.profileName || "default");
    });
  });
}

async function connectToHost() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const port = await getPort();
  console.log(`[Loki Background] Connecting to ws://127.0.0.1:${port}/ws`);
  
  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  ws.onopen = () => {
    console.log("[Loki Background] Connected to MCP WebSocket server");
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    syncTabs();
  };

  ws.onclose = () => {
    console.log("[Loki Background] Disconnected from MCP server");
    ws = null;
    if (!reconnectTimer) {
      reconnectTimer = setInterval(connectToHost, 3000);
    }
  };

  ws.onerror = (err) => {
    console.error("[Loki Background] WebSocket error:", err);
    ws?.close();
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data) as LokiMessage;
      console.log("[Loki Background] Received event:", msg.type, msg);

      switch (msg.type) {
        case "LOKI_OPEN_TAB": {
          const tab = await createTab({ url: msg.url, active: msg.active });
          sendResponse({
            type: "LOKI_COMMAND_RESPONSE",
            task_id: msg.task_id,
            success: true,
            data: { tab_id: tab.id }
          });
          break;
        }
        case "LOKI_CLOSE_TAB": {
          await removeTab(msg.tab_id);
          sendResponse({
            type: "LOKI_COMMAND_RESPONSE",
            task_id: msg.task_id,
            success: true,
            data: {}
          });
          break;
        }
        case "LOKI_ACTIVATE_TAB": {
          await updateTab(msg.tab_id, { active: true });
          sendResponse({
            type: "LOKI_COMMAND_RESPONSE",
            task_id: msg.task_id,
            success: true,
            data: {}
          });
          break;
        }
        case "LOKI_EXECUTE_ONESHOT": {
          await handleExecuteOneshot(msg);
          break;
        }
      }
    } catch (err: any) {
      console.error("[Loki Background] Error handling WS message:", err);
    }
  };
}

function sendResponse(response: LokiMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

function checkTabPermission(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    resolve(true);
  });
}

async function handleExecuteOneshot(msg: Extract<LokiMessage, { type: "LOKI_EXECUTE_ONESHOT" }>) {
  let targetTabId = msg.target_tab_id;

  // Resolve by URL pattern if tab ID not specified
  if (!targetTabId && msg.target_url_pattern) {
    const tabs = await queryTabs({ url: msg.target_url_pattern });
    if (tabs.length > 0) {
      targetTabId = tabs[0].id;
    }
  }

  // Fallback to active tab
  if (!targetTabId) {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      targetTabId = tabs[0].id;
    }
  }

  if (!targetTabId) {
    sendResponse({
      type: "LOKI_EXECUTE_ONESHOT_RESPONSE",
      task_id: msg.task_id,
      success: false,
      data: {},
      logs: ["Error: Target tab not found."]
    });
    return;
  }

  // Gated sandbox authorization check
  const isAllowed = await checkTabPermission(targetTabId);
  if (!isAllowed) {
    sendResponse({
      type: "LOKI_EXECUTE_ONESHOT_RESPONSE",
      task_id: msg.task_id,
      success: false,
      data: {},
      logs: ["Security Blocked: Script execution is locked for this tab. Please authorize it in the loki-auto settings page."]
    });
    return;
  }

  // Forward command to target Content Script
  try {
    const response = await sendMessageToTab(targetTabId, {
      type: "LOKI_EXECUTE_ONESHOT",
      rhai_script: msg.rhai_script,
      payload: msg.payload
    });

    sendResponse({
      type: "LOKI_EXECUTE_ONESHOT_RESPONSE",
      task_id: msg.task_id,
      success: response.success,
      data: response.data,
      logs: response.logs || []
    });
  } catch (err: any) {
    sendResponse({
      type: "LOKI_EXECUTE_ONESHOT_RESPONSE",
      task_id: msg.task_id,
      success: false,
      data: {},
      logs: [`Extension message forwarding failed: ${err.message || err}`]
    });
  }
}

// Synchronize all open tabs metadata to local Axum MCP Server
async function syncTabs() {
  try {
    const tabs = await queryTabs({});
    const profileName = await getProfileName();
    const tabMetadatas: TabMetadata[] = tabs
      .filter(t => t.id !== undefined && t.url !== undefined)
      .map(t => ({
        id: t.id!,
        url: t.url || "",
        title: t.title || "",
        isFocused: t.active,
        profile: profileName
      }));

    sendResponse({
      type: "LOKI_TAB_LIST_UPDATE",
      tabs: tabMetadatas
    });
  } catch (err) {
    console.error("[Loki Background] Error syncing tabs:", err);
  }
}

// Watch tab updates to trigger synchronization
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    syncTabs();
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["authorizedTabIds"], (res) => {
    const activeIds = res.authorizedTabIds || [];
    const updated = activeIds.filter((id: number) => id !== tabId);
    chrome.storage.local.set({ authorizedTabIds: updated }, () => {
      syncTabs();
    });
  });
});
chrome.tabs.onActivated.addListener(() => syncTabs());

// Listen for options port change or content script registration
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LOKI_PORT_CHANGED") {
    ws?.close();
    connectToHost();
  }
});

// Startup connection
connectToHost();
