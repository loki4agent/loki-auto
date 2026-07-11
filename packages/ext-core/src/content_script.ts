import init, { RhaiWasmEngine } from "../../sandbox/pkg/loki_sandbox.js";
import { wasmBase64 } from "./loki_sandbox_wasm";

let isWasmInitialized = false;

// Convert base64 string back to Uint8Array buffer
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function initializeSandbox() {
  if (isWasmInitialized) return;
  const wasmBytes = base64ToUint8Array(wasmBase64);
  await init(wasmBytes);
  isWasmInitialized = true;
  console.log("[Loki Content] Rhai WASM engine sandbox initialized successfully.");
}

// Listen for execution commands from the background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "LOKI_EXECUTE_ONESHOT") {
    runTask(message.rhai_script, message.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, data: {}, logs: [String(err)] }));
    return true; // Keep message channel open for async response
  }
});

async function runTask(rhaiScript: string, payload: any) {
  await initializeSandbox();

  let engineInstance: RhaiWasmEngine | null = null;
  const logs: string[] = [];

  // Temporarily hijack console.log to capture [Loki VM] print statements
  const originalConsoleLog = console.log;
  console.log = (...args: any[]) => {
    const formatted = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(" ");
    if (formatted.startsWith("[Loki VM]")) {
      logs.push(formatted.replace("[Loki VM] ", ""));
    }
    originalConsoleLog.apply(console, args);
  };

  try {
    engineInstance = new RhaiWasmEngine();
    engineInstance.inject_payload(JSON.stringify(payload));

    console.log("[Loki Content] Starting execution of Rhai script...");
    const resultString = await engineInstance.eval_async(rhaiScript);
    
    let parsedData = {};
    try {
      parsedData = JSON.parse(resultString);
    } catch {
      parsedData = { raw_result: resultString };
    }

    return {
      success: true,
      data: parsedData,
      logs
    };
  } catch (err: any) {
    console.error("[Loki Content] Sandbox execution aborted:", err);
    // Active DOM snapshot captured for self-healing diagnostics
    const domSnapshot = engineInstance ? engineInstance.get_filtered_dom() : "";
    return {
      success: false,
      data: { dom_snapshot: domSnapshot },
      logs: [...logs, `Execution aborted: ${err.message || err}`]
    };
  } finally {
    // Restore console.log and purge the VM instance
    console.log = originalConsoleLog;
    if (engineInstance) {
      engineInstance.destroy();
      engineInstance = null;
    }
  }
}
