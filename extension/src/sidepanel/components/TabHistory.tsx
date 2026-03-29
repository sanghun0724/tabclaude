import { useState, useEffect, useCallback } from "react";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { getSavedTabs, searchSavedTabs, deleteSavedTab } from "@/lib/storage";
import type { SavedTab } from "@/lib/types";

export function TabHistory() {
  const { t } = useT();
  const [tabs, setTabs] = useState<(SavedTab & { id?: number })[]>([]);
  const [query, setQuery] = useState("");
  const [claudeQuery, setClaudeQuery] = useState("");

  const loadTabs = useCallback(async () => {
    const saved = query
      ? await searchSavedTabs(query)
      : await getSavedTabs();
    setTabs(saved as (SavedTab & { id?: number })[]);
  }, [query]);

  useEffect(() => {
    loadTabs();
  }, [loadTabs]);

  const handleRestore = (url: string) => {
    chrome.runtime.sendMessage({ type: "RESTORE_TABS", urls: [url] });
  };

  const handleDelete = async (id: number) => {
    await deleteSavedTab(id);
    loadTabs();
  };

  const handleClaudeRestore = () => {
    if (!claudeQuery.trim()) return;
    chrome.runtime.sendMessage(
      {
        type: "ASK_CLAUDE",
        payload: {
          action: "restore",
          query: claudeQuery,
        },
      },
      (response) => {
        if (response?.data?.urls) {
          chrome.runtime.sendMessage({
            type: "RESTORE_TABS",
            urls: response.data.urls,
          });
        }
      },
    );
    setClaudeQuery("");
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("history.searchPlaceholder")}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-colors"
        />
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-stone-400">
          {t("history.claudeRestore")}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={claudeQuery}
            onChange={(e) => setClaudeQuery(e.target.value)}
            placeholder={t("history.claudePlaceholder")}
            className="flex-1 rounded border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleClaudeRestore()}
          />
          <button
            onClick={handleClaudeRestore}
            className="rounded bg-rose-500 px-3 py-1 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
          >
            {t("history.ask")}
          </button>
        </div>
      </div>

      <div className="divide-y divide-stone-100">
        {tabs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-xl text-stone-300">
              ◇
            </div>
            <p className="text-sm font-medium text-stone-500">
              {query ? t("history.noMatching") : t("history.noSaved")}
            </p>
          </div>
        ) : (
          tabs.map((tab, i) => (
            <HistoryTabRow
              key={tab.id ?? i}
              tab={tab}
              onRestore={handleRestore}
              onDelete={handleDelete}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HistoryTabRow({
  tab,
  onRestore,
  onDelete,
  t,
}: {
  tab: SavedTab & { id?: number };
  onRestore: (url: string) => void;
  onDelete: (id: number) => void;
  t: (key: MessageKey) => string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded px-2 py-2 hover:bg-stone-50 transition-colors">
      {tab.favIconUrl && !imgError ? (
        <img
          src={tab.favIconUrl}
          alt=""
          className="h-4 w-4 shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-stone-200 text-[9px] font-bold text-stone-500">
          {(tab.title || tab.url).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-stone-700">
          {tab.title || tab.url}
        </p>
        <p className="truncate text-[11px] text-stone-400">{tab.url}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => onRestore(tab.url)}
          className="flex h-6 items-center rounded-md px-2 text-[12px] font-medium text-stone-500 hover:text-rose-500 hover:bg-rose-50 transition-colors"
        >
          {t("history.open")}
        </button>
        {tab.id && (
          <button
            onClick={() => onDelete(tab.id!)}
            className="flex h-6 items-center rounded-md px-2 text-[12px] font-medium text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            {t("history.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
