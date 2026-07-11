import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { TabMetadata } from "@loki/shared-types";
import "./index.css";

const Options = () => {
  const [activeTab, setActiveTab] = useState<"settings" | "playground" | "permissions">("playground");
  const [port, setPort] = useState<number>(10402);
  const [profileName, setProfileName] = useState<string>("default");
  const [tabs, setTabs] = useState<TabMetadata[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | "">("");
  const [script, setScript] = useState<string>(
    `// Select a tab and run this test script!\nprint("Capturing DOM structure...");\nlet dom = dom_to_string();\nprint("DOM elements captured.");\n"Execution Successful"`
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Gated tab sandbox authorization states
  const [globalTabManipulate, setGlobalTabManipulate] = useState<boolean>(true);
  const [authorizedTabIds, setAuthorizedTabIds] = useState<number[]>([]);

  useEffect(() => {
    // Load saved settings
    chrome.storage.local.get(["axumPort", "profileName", "globalTabManipulate", "authorizedTabIds"], (res) => {
      if (res.axumPort) {
        setPort(res.axumPort);
      }
      if (res.profileName) {
        setProfileName(res.profileName);
      }
      if (res.globalTabManipulate !== undefined) {
        setGlobalTabManipulate(res.globalTabManipulate);
      }
      if (res.authorizedTabIds) {
        setAuthorizedTabIds(res.authorizedTabIds);
      }
    });

    // Initial tabs query
    fetchTabs();
    
    // Set up a listener for tab sync events from background
    const messageListener = (msg: any) => {
      if (msg.type === "LOKI_TAB_LIST_UPDATE") {
        setTabs(msg.tabs);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const fetchTabs = () => {
    try {
      chrome.tabs.query({}, (allTabs) => {
        const tabsList = allTabs || [];
        const metadatas: TabMetadata[] = tabsList
          .filter(t => t.id !== undefined)
          .map(t => ({
            id: t.id!,
            url: t.url || "",
            title: t.title || "",
            isFocused: t.active
          }));
        setTabs(metadatas);
        if (metadatas.length > 0 && selectedTabId === "") {
          setSelectedTabId(metadatas[0].id);
        }
      });
    } catch (e) {
      console.error("Failed to query tabs:", e);
    }
  };

  const handleSaveSettings = () => {
    chrome.storage.local.set({ axumPort: port, profileName: profileName }, () => {
      setSaveStatus("Settings updated. Reconnecting...");
      chrome.runtime.sendMessage({ type: "LOKI_PORT_CHANGED" });
      setTimeout(() => setSaveStatus(""), 3000);
    });
  };

  const handleToggleGlobal = (checked: boolean) => {
    setGlobalTabManipulate(checked);
    chrome.storage.local.set({ globalTabManipulate: checked });
  };

  const handleToggleTabAuth = (tabId: number) => {
    let updated: number[];
    if (authorizedTabIds.includes(tabId)) {
      updated = authorizedTabIds.filter(id => id !== tabId);
    } else {
      updated = [...authorizedTabIds, tabId];
    }
    setAuthorizedTabIds(updated);
    chrome.storage.local.set({ authorizedTabIds: updated });
  };

  const handleFocusTab = async (tabId: number) => {
    await chrome.tabs.update(tabId, { active: true });
    fetchTabs();
  };

  const handleExecute = async () => {
    if (selectedTabId === "") return;
    setIsExecuting(true);
    setLogs([]);
    setResult("");
    setIsDrawerOpen(true); // Open the drawer immediately to show logs

    try {
      chrome.tabs.sendMessage(
        Number(selectedTabId),
        {
          type: "LOKI_EXECUTE_ONESHOT",
          rhai_script: script,
          payload: {}
        },
        (res) => {
          setIsExecuting(false);
          if (chrome.runtime.lastError) {
            setResult(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }
          if (res) {
            setLogs(res.logs || []);
            setResult(JSON.stringify(res.data, null, 2));
          } else {
            setResult("Error: Received empty response from sandbox.");
          }
        }
      );
    } catch (err: any) {
      setIsExecuting(false);
      setResult(`Bridge error: ${err.message || err}`);
    }
  };

  // Helper to check if currently selected tab is authorized
  const isSelectedTabAuthorized =
    globalTabManipulate &&
    selectedTabId !== "" &&
    authorizedTabIds.includes(Number(selectedTabId));

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden selection:bg-cyan-500 selection:text-slate-950">
      
      {/* 1. Left Sidebar */}
      <aside className="w-64 border-r border-slate-900 bg-slate-950 flex flex-col p-6 space-y-8 flex-shrink-0">
        
        {/* Logo / Branding */}
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-900">
          <img
            src={chrome.runtime.getURL("icons/icon32.png")}
            alt="loki-auto"
            className="w-6 h-6 object-contain rounded-lg shadow-[0_0_10px_rgba(6,182,212,0.2)]"
          />
          <span className="font-extrabold text-lg tracking-wide bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            loki-auto
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-1">
          <button
            onClick={() => setActiveTab("playground")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
              activeTab === "playground"
                ? "bg-cyan-950/20 text-cyan-400 border border-cyan-900/60 shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/20"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Playground
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
              activeTab === "permissions"
                ? "bg-cyan-950/20 text-cyan-400 border border-cyan-900/60 shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/20"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Permissions
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
              activeTab === "settings"
                ? "bg-cyan-950/20 text-cyan-400 border border-cyan-900/60 shadow-[0_0_15px_rgba(6,182,212,0.05)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/20"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </nav>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 font-mono border-t border-slate-900 pt-4 flex flex-col gap-1.5">
          <div>Gateway: 127.0.0.1:{port}</div>
          <div>Profile: {profileName}</div>
          <div className="flex items-center gap-1">
            Status: 
            <span className={globalTabManipulate ? "text-cyan-400 font-bold" : "text-amber-500 font-bold"}>
              {globalTabManipulate ? "Gating Active" : "Gating Disabled"}
            </span>
          </div>
          <div className="text-[9px] text-slate-650 mt-2 border-t border-slate-900/60 pt-2 text-center">
            powered by <a href="https://loki4agent.com" target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400 transition font-semibold">loki4agent.com</a>
          </div>
        </div>
      </aside>

      {/* 2. Main Content View */}
      <main className="flex-1 bg-slate-950/40 p-8 overflow-y-auto relative min-w-0">
        
        {activeTab === "settings" ? (
          /* Settings Tab Content */
          <div className="max-w-xl mx-auto space-y-6">
            <div className="pb-4 border-b border-slate-900">
              <h1 className="text-3xl font-extrabold tracking-tight">System Settings</h1>
              <p className="text-slate-400 text-sm mt-1">Configure loki-auto local endpoints and profile parameters.</p>
            </div>

            {/* Gateway Configuration Card */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-slate-200">MCP Server Connection</h2>
              
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block font-medium">MCP Gateway TCP Port</label>
                <input
                  type="text"
                  value={port || ""}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setPort(val ? Number(val) : 0);
                  }}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-900 rounded-xl focus:outline-none focus:border-cyan-500 text-sm font-semibold transition"
                  placeholder="10402"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  The local WebSocket port used to communicate with the host MCP Server. <span className="text-amber-500/80 font-medium">Modifying this is not recommended</span> unless your host configuration requires a different port.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block font-medium">Profile Name / Account Label</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-900 rounded-xl focus:outline-none focus:border-cyan-500 text-sm font-semibold transition"
                  placeholder="e.g. reddit marketing"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Help the LLM understand the purpose of this browser session. Choose a semantic label describing its role (e.g., <code className="text-cyan-500/90 bg-cyan-950/20 px-1 py-0.5 rounded font-mono">reddit marketing</code>, <code className="text-cyan-500/90 bg-cyan-950/20 px-1 py-0.5 rounded font-mono">SEO growth</code>, or <code className="text-cyan-500/90 bg-cyan-950/20 px-1 py-0.5 rounded font-mono">personal shopping</code>).
                </p>
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-sm transition duration-200"
              >
                Save Settings
              </button>

              {saveStatus && (
                <p className="text-xs text-cyan-400 animate-pulse text-center mt-2">{saveStatus}</p>
              )}
            </div>
          </div>
        ) : activeTab === "permissions" ? (
          /* Permissions Tab Content */
          <div className="max-w-xl mx-auto space-y-6">
            <div className="pb-4 border-b border-slate-900">
              <h1 className="text-3xl font-extrabold tracking-tight">Security & Permissions</h1>
              <p className="text-slate-400 text-sm mt-1">Control which browser tabs are authorized to run automation scripts.</p>
            </div>

            {/* Gated Security Permissions Card */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-900/60">
                <div>
                  <h2 className="text-base font-bold text-slate-200">Global Tab Manipulation</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Toggle script execution capabilities across all tabs.</p>
                </div>
                
                {/* Global Toggle Switch */}
                <button
                  onClick={() => handleToggleGlobal(!globalTabManipulate)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                    globalTabManipulate ? "bg-cyan-600" : "bg-slate-800"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform duration-200 ${
                      globalTabManipulate ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Tab Authorization List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <span>Target Open Tab (Truncated to 50 chars)</span>
                  <span>Execution Status</span>
                </div>

                <div className="divide-y divide-slate-900/60 max-h-[350px] overflow-y-auto pr-1">
                  {tabs.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center">No active tabs found.</div>
                  ) : (
                    tabs.map((tab) => {
                      const isAuth = authorizedTabIds.includes(tab.id);
                      const titleTrunc = tab.title.length > 50 ? `${tab.title.substring(0, 50)}...` : tab.title;
                      return (
                        <div key={tab.id} className="flex justify-between items-center py-3 text-xs gap-4">
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="font-semibold text-slate-350 truncate" title={tab.title}>
                              {titleTrunc || "New Tab"}
                            </span>
                            <span className="font-mono text-[9px] text-slate-550 truncate" title={tab.url}>
                              {tab.url || "about:blank"}
                            </span>
                          </div>
                          
                          {/* Active / Locked toggle switch */}
                          <button
                            onClick={() => handleToggleTabAuth(tab.id)}
                            disabled={!globalTabManipulate}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border uppercase tracking-wider transition ${
                              !globalTabManipulate
                                ? "border-slate-900 text-slate-650 cursor-not-allowed bg-slate-950/20"
                                : isAuth
                                ? "bg-cyan-950/30 border-cyan-800 text-cyan-400 hover:bg-cyan-950/50"
                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                            }`}
                          >
                            {isAuth ? "Active" : "Locked"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Playground Tab Content */
          <div className="space-y-6 h-full flex flex-col">
            
            {/* Header section */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-900 flex-shrink-0">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Loki-Auto Playground</h1>
                <p className="text-slate-400 text-sm mt-1">Select a browser tab and test automation scripts in the WASM VM.</p>
              </div>

              {/* Execution and Tab Select controls */}
              <div className="flex items-center gap-3">
                <select
                  value={selectedTabId}
                  onChange={(e) => setSelectedTabId(Number(e.target.value))}
                  className="px-4 py-2 bg-slate-900 border border-slate-900 rounded-xl text-xs font-semibold focus:outline-none focus:border-cyan-500"
                >
                  <option value="" disabled>Select Target Tab</option>
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title.substring(0, 24)}... ({tab.id})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleExecute}
                  disabled={isExecuting || selectedTabId === "" || !isSelectedTabAuthorized}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isExecuting || selectedTabId === "" || !isSelectedTabAuthorized
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800"
                      : "bg-cyan-600 hover:bg-cyan-500 text-slate-950"
                  }`}
                >
                  {isExecuting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                      Running...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Run Script
                    </>
                  )}
                </button>
                
                {/* Console Toggle Button */}
                {(logs.length > 0 || result) && (
                  <button
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    className="px-4 py-2 bg-slate-900 border border-slate-900 hover:border-cyan-800 text-xs font-semibold rounded-xl text-slate-300 transition"
                  >
                    Console
                  </button>
                )}
              </div>
            </div>

            {/* Sandbox Security Gate Alert Prompt */}
            {!isSelectedTabAuthorized && selectedTabId !== "" && (
              <div className="bg-amber-950/20 border border-amber-900/60 rounded-2xl p-4 text-xs text-amber-300 flex items-center justify-between flex-shrink-0 animate-pulse">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    {!globalTabManipulate
                      ? "Global Script execution is blocked. Please enable permissions in the Permissions tab."
                      : "Target tab is Locked. Click 'Authorize' to unlock sandbox execution for this page."}
                  </span>
                </div>
                {globalTabManipulate && (
                  <button
                    onClick={() => handleToggleTabAuth(Number(selectedTabId))}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-[10px] uppercase tracking-wider transition"
                  >
                    Authorize Tab
                  </button>
                )}
              </div>
            )}

            {/* Middle Grid: Editor Left, Tabs List Right */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
              
              {/* Script Editor Container */}
              <div className="lg:col-span-2 flex flex-col bg-slate-900/20 backdrop-blur-md border border-slate-900 rounded-2xl overflow-hidden min-h-[300px]">
                <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-900 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>serverless_in_browser.rhai</span>
                  <span>WASM Sandbox</span>
                </div>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  className="flex-1 w-full font-mono text-xs bg-slate-950 border-0 p-5 focus:outline-none focus:ring-0 leading-relaxed text-cyan-400/90 resize-none overflow-y-auto"
                  style={{ tabSize: 2 }}
                />
              </div>

              {/* Active Tabs Sidebar on the right */}
              <div className="lg:col-span-1 bg-slate-900/20 backdrop-blur-md border border-slate-900 rounded-2xl p-5 flex flex-col min-h-[300px] overflow-hidden">
                <div className="flex items-center justify-between pb-3 border-b border-slate-900/60 mb-4">
                  <h2 className="text-sm font-bold text-slate-200">Browser Workspace Tabs</h2>
                  <button onClick={fetchTabs} className="p-1 text-slate-400 hover:text-cyan-400 transition" title="Refresh list">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-2.5 overflow-y-auto flex-1 pr-1 text-xs">
                  {tabs.length === 0 ? (
                    <div className="text-slate-500 italic text-center pt-8">No tabs synchronized.</div>
                  ) : (
                    tabs.map((tab) => {
                      const isAuth = authorizedTabIds.includes(tab.id);
                      return (
                        <div
                          key={tab.id}
                          onClick={() => setSelectedTabId(tab.id)}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition ${
                            selectedTabId === tab.id
                              ? "bg-cyan-950/20 border-cyan-800/60 shadow-[0_0_10px_rgba(6,182,212,0.03)]"
                              : "bg-slate-950/80 border-slate-900 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className={`font-semibold truncate flex-1 ${selectedTabId === tab.id ? "text-cyan-300" : "text-slate-300"}`}>{tab.title}</span>
                            <span className="text-[9px] bg-slate-900 px-1 py-0.5 rounded text-slate-500">#{tab.id}</span>
                          </div>
                          <span className="text-slate-500 truncate font-mono text-[9px]">{tab.url}</span>
                          <div className="flex justify-between items-center mt-2 border-t border-slate-900/60 pt-2 text-[9px]">
                            <span className="text-slate-400">
                              {tab.isFocused ? "🟢 Focused" : "⚪ Background"} 
                              <span className={`ml-2 px-1 py-0.5 rounded font-bold uppercase text-[8px] ${
                                globalTabManipulate && isAuth ? "bg-cyan-950/40 text-cyan-400" : "bg-slate-900 text-slate-500"
                              }`}>
                                {globalTabManipulate && isAuth ? "Active" : "Locked"}
                              </span>
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFocusTab(tab.id);
                              }}
                              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[9px] rounded text-slate-300 transition"
                            >
                              Focus
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* 3. Sliding Right Drawer (Console Terminal and execution outputs) */}
      <div className={`fixed top-0 right-0 h-full w-[460px] border-l border-slate-900 bg-slate-950/95 backdrop-blur-lg shadow-2xl transition-transform duration-300 ease-out z-50 p-6 flex flex-col space-y-6 ${
        isDrawerOpen ? "translate-x-0" : "translate-x-full"
      }`}>
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse"></span>
            <h3 className="font-bold text-slate-200 text-sm font-mono uppercase tracking-wider">Execution Terminal</h3>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-200 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Drawer Body Container */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          
          {/* Section: Console Logs */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest font-mono">Console Prints</h4>
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-[10px] space-y-2 min-h-[120px] text-slate-300">
              {logs.length === 0 ? (
                <span className="text-slate-650 italic">No output print statements.</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2.5 items-start leading-relaxed">
                    <span className="text-cyan-500 flex-shrink-0">❯</span>
                    <span>{log}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Return Value */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-widest font-mono">Returned Payload</h4>
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-[10px] min-h-[150px] overflow-x-auto text-emerald-400/90 leading-relaxed">
              {result ? (
                <pre className="whitespace-pre-wrap">{result}</pre>
              ) : (
                <span className="text-slate-650 italic">No returned payload.</span>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Options />);
