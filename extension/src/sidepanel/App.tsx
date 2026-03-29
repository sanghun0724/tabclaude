import { useState, useEffect, useCallback } from "react";
import { Dashboard } from "./components/Dashboard";
import { SuggestionCard } from "./components/SuggestionCard";
import { Sessions } from "./components/Sessions";
import { TabHistory } from "./components/TabHistory";
import { Settings } from "./components/Settings";
import { UndoToast } from "./components/UndoToast";
import { useT } from "@/i18n";
import type { TabSummary, Suggestion } from "@/lib/types";
import type { MessageKey } from "@/i18n";

type View = "dashboard" | "sessions" | "history" | "settings";

const navKeys: Record<View, MessageKey> = {
  dashboard: "app.nav.dashboard",
  sessions: "app.nav.sessions",
  history: "app.nav.history",
  settings: "app.nav.settings",
};

export default function App() {
  const { t } = useT();
  const [view, setView] = useState<View>("dashboard");
  const [summary, setSummary] = useState<TabSummary | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [connected, setConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(
    () => localStorage.getItem("guide_dismissed") === "true",
  );

  const refreshSummary = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_TAB_SUMMARY" }, (response) => {
      if (response?.summary) setSummary(response.summary);
    });
  }, []);

  useEffect(() => {
    refreshSummary();

    chrome.runtime.sendMessage({ type: "GET_HOST_STATUS" }, (response) => {
      setConnected(response?.connected ?? false);
    });

    const listener = (message: { type: string; suggestions?: Suggestion[] }) => {
      if (message.type === "SUGGESTIONS_UPDATED" && message.suggestions) {
        setSuggestions(message.suggestions);
        setIsAnalyzing(false);
      }
      if (message.type === "TAB_SUMMARY_UPDATED") {
        refreshSummary();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshSummary]);

  return (
    <div className="flex h-screen flex-col bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200/60 bg-white px-5 py-3.5">
        <h1 className="text-[15px] font-bold tracking-tight text-stone-900">{t("app.title")}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_6px_rgba(5,150,105,0.4)]" : "bg-red-400"}`}
          />
          <span className="text-[12px] font-medium text-stone-400">
            {connected ? t("app.claudeConnected") : t("app.claudeOffline")}
          </span>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-stone-200/60 bg-white px-3 pt-1">
        {(["dashboard", "sessions", "history", "settings"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
              view === v
                ? "text-stone-900"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            {t(navKeys[v])}
            {view === v && (
              <span className="absolute bottom-0 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-rose-500" />
            )}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4">
        {view === "dashboard" && (
          <>
            <Dashboard summary={summary} onRefresh={refreshSummary} isAnalyzing={isAnalyzing} onAnalyze={() => {
              setIsAnalyzing(true);
              chrome.runtime.sendMessage({ type: "ANALYZE_TABS" });
            }} />
            {suggestions.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-stone-700">
                    {t("app.suggestions")}
                  </h2>
                  <button
                    onClick={() => {
                      for (const s of suggestions) {
                        chrome.runtime.sendMessage({ type: "APPLY_SUGGESTION", suggestion: s });
                      }
                      setSuggestions([]);
                    }}
                    className="rounded-md bg-rose-500 px-3 py-1 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
                  >
                    {t("suggestion.applyAll")}
                  </button>
                </div>
                {suggestions.map((s, i) => (
                  <SuggestionCard key={i} suggestion={s} onApplied={() => {
                    setSuggestions(prev => prev.filter((_, idx) => idx !== i));
                  }} />
                ))}
              </div>
            )}
          </>
        )}
        {view === "sessions" && <Sessions />}
        {view === "history" && <TabHistory />}
        {view === "settings" && <Settings />}
      </main>

      {!connected && !guideDismissed && (
        <div className="border-t border-stone-200/60 bg-white px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-stone-700">{t("guide.title")}</p>
            <button
              onClick={() => {
                setGuideDismissed(true);
                localStorage.setItem("guide_dismissed", "true");
              }}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              {t("guide.dismiss")}
            </button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-stone-500">{t("guide.step1")}</p>
            <code className="block rounded bg-stone-100 px-2 py-1 text-xs font-mono text-stone-700 select-all">
              {t("guide.step1.cmd")}
            </code>
            <p className="text-xs text-stone-500">{t("guide.step2")}</p>
            <code className="block rounded bg-stone-100 px-2 py-1 text-xs font-mono text-stone-700 select-all">
              {t("guide.step2.cmd")}
            </code>
            <p className="text-xs text-stone-500">{t("guide.step3")}</p>
          </div>
          <p className="text-xs text-stone-400 italic">{t("guide.optional")}</p>
        </div>
      )}

      <UndoToast />
    </div>
  );
}
