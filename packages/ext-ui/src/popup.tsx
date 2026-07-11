import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const Popup = () => {
  const [port, setPort] = useState<number>(10402);
  const [currentTab, setCurrentTab] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    // Load port
    chrome.storage.local.get(["axumPort"], (res) => {
      if (res.axumPort) setPort(res.axumPort);
    });

    // Query current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        setCurrentTab({
          url: tabs[0].url || "",
          title: tabs[0].title || ""
        });
      }
    });
  }, []);

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-[320px] bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-4 font-sans space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-gradient-to-tr from-cyan-400 to-blue-500 rounded-full"></span>
          <span className="font-extrabold text-sm tracking-wide bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            loki-auto
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 border border-cyan-800/60 bg-cyan-950/20 px-2 py-0.5 rounded-full font-semibold">
          Active Gateway
        </span>
      </div>

      {/* Connection Info */}
      <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Target Address</span>
          <span className="font-mono font-semibold text-slate-200">127.0.0.1:{port}</span>
        </div>
      </div>

      {/* Target Tab Info */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Target Page</span>
        <div className="bg-slate-950 border border-slate-800/60 rounded-xl p-3 text-xs space-y-1">
          {currentTab ? (
            <>
              <div className="font-bold text-slate-200 truncate">{currentTab.title}</div>
              <div className="text-[10px] text-slate-500 truncate font-mono">{currentTab.url}</div>
            </>
          ) : (
            <div className="text-slate-500 italic">No web page focused.</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={openOptions}
        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-950/30 transition duration-200"
      >
        Open Loki Playground
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
