import { useState, useEffect, useCallback, useRef } from "react";
import { useT } from "@/i18n";
import type { MessageKey } from "@/i18n";
import type { Session, SavedTab } from "@/lib/types";
import { exportSessions, parseImport } from "@/lib/import-export";
import { showUndoToast } from "./UndoToast";
import { saveTabsToSession, getTabsBySession, addTabToSession } from "@/lib/storage";

type SessionWithCount = Session & { tabCount: number };
type TabWithId = SavedTab & { id: number };

export function Sessions() {
  const { locale, t } = useT();
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedTabs, setExpandedTabs] = useState<TabWithId[]>([]);
  const [query, setQuery] = useState("");
  const [claudeQuery, setClaudeQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const importFileRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(() => {
    setIsLoading(true);
    chrome.runtime.sendMessage(
      { type: "GET_SESSIONS", query: query || undefined },
      (response) => {
        if (response?.ok) setSessions(response.sessions);
        setIsLoading(false);
      },
    );
  }, [query]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadTabs = (sessionId: number) => {
    chrome.runtime.sendMessage(
      { type: "GET_SESSION_TABS", sessionId },
      (response) => {
        if (response?.ok) setExpandedTabs(response.tabs);
      },
    );
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedTabs([]);
    } else {
      setExpandedId(id);
      loadTabs(id);
    }
  };

  const handleSaveAll = () => {
    chrome.runtime.sendMessage({ type: "SAVE_ALL_TABS" }, () => {
      loadSessions();
    });
  };

  const handleRestoreSession = (sessionId: number) => {
    chrome.runtime.sendMessage({ type: "RESTORE_SESSION", sessionId });
  };

  const handleDeleteSession = async (sessionId: number) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (!confirm(t("sessions.deleteConfirm"))) return;
    const tabs = await getTabsBySession(sessionId);

    chrome.runtime.sendMessage({ type: "DELETE_SESSION", sessionId }, (response) => {
      if (!response?.ok) return;
      if (expandedId === sessionId) {
        setExpandedId(null);
        setExpandedTabs([]);
      }
      loadSessions();

      showUndoToast({
        message: t("sessions.deleted", { name: session.name }),
        onUndo: () => {
          const tabsToSave = tabs.map((tab) => ({
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            closedAt: tab.closedAt,
          }));
          saveTabsToSession(tabsToSave, session.name).then(() => loadSessions());
        },
      });
    });
  };

  const handleToggleLock = (session: SessionWithCount) => {
    chrome.runtime.sendMessage(
      {
        type: "UPDATE_SESSION",
        sessionId: session.id,
        patch: { locked: !session.locked },
      },
      () => loadSessions(),
    );
  };

  const handleToggleStar = (session: SessionWithCount) => {
    chrome.runtime.sendMessage(
      {
        type: "UPDATE_SESSION",
        sessionId: session.id,
        patch: { starred: !session.starred },
      },
      () => loadSessions(),
    );
  };

  const handleRename = (sessionId: number) => {
    if (!editName.trim()) return;
    chrome.runtime.sendMessage(
      {
        type: "UPDATE_SESSION",
        sessionId,
        patch: { name: editName.trim() },
      },
      () => {
        setEditingId(null);
        loadSessions();
      },
    );
  };

  const handleRestoreTab = (url: string) => {
    chrome.runtime.sendMessage({ type: "RESTORE_TAB_FROM_SESSION", url });
  };

  const handleDeleteTab = (tabId: number, sessionId: number) => {
    const tab = expandedTabs.find((tab) => tab.id === tabId);
    chrome.runtime.sendMessage(
      { type: "DELETE_TAB_FROM_SESSION", tabId },
      (response) => {
        if (!response?.ok) return;
        loadTabs(sessionId);
        loadSessions();

        if (tab) {
          showUndoToast({
            message: t("sessions.deletedTab", { name: tab.title || tab.url }),
            onUndo: () => {
              addTabToSession(sessionId, {
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl,
                closedAt: tab.closedAt,
              }).then(() => {
                loadTabs(sessionId);
                loadSessions();
              });
            },
          });
        }
      },
    );
  };

  const handleExport = async () => {
    const sessionsWithTabs = await Promise.all(
      sessions.map(async (s) => {
        const tabs = await getTabsBySession(s.id!);
        return { ...s, tabs };
      }),
    );
    const text = exportSessions(sessionsWithTabs);
    await navigator.clipboard.writeText(text);
    alert(t("sessions.exportedClipboard"));
  };

  const handleImport = async () => {
    const parsed = parseImport(importText);
    if (parsed.length === 0) {
      alert(t("sessions.noValidTabs"));
      return;
    }
    for (const session of parsed) {
      await saveTabsToSession(
        session.tabs.map((tab) => ({ url: tab.url, title: tab.title, closedAt: Date.now() })),
        session.name,
      );
    }
    setImportText("");
    setShowImport(false);
    loadSessions();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string);
      setShowImport(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClaudeRestore = () => {
    if (!claudeQuery.trim()) return;
    chrome.runtime.sendMessage(
      {
        type: "ASK_CLAUDE",
        payload: { action: "restore", query: claudeQuery },
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
      {/* Save All Button */}
      <button
        onClick={handleSaveAll}
        className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 active:scale-[0.98] transition-all"
      >
        {t("sessions.saveAll")}
      </button>

      {/* Export / Import */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 rounded-md bg-stone-100 py-2 text-[12px] font-medium text-stone-600 hover:bg-stone-200 transition-colors"
        >
          {t("sessions.exportAll")}
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="flex-1 rounded-md bg-stone-100 py-2 text-[12px] font-medium text-stone-600 hover:bg-stone-200 transition-colors"
        >
          {t("sessions.import")}
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".txt,.text"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => importFileRef.current?.click()}
          className="rounded-md bg-stone-100 px-3 py-2 text-[12px] font-medium text-stone-600 hover:bg-stone-200 transition-colors"
          title={t("sessions.importFromFile")}
        >
          File
        </button>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-2">
          <p className="text-xs font-medium text-stone-500">
            {t("sessions.importHint")}
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"https://example.com | Example Page\nhttps://github.com | GitHub\n\nhttps://google.com | Google"}
            className="w-full rounded border border-stone-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
            rows={6}
          />
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="flex-1 rounded bg-stone-900 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
            >
              {t("sessions.import")}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText(""); }}
              className="flex-1 rounded border border-stone-200 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              {t("sessions.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Claude Restore */}
      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-stone-400">
          {t("sessions.claudeRestore")}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={claudeQuery}
            onChange={(e) => setClaudeQuery(e.target.value)}
            placeholder={t("sessions.claudePlaceholder")}
            className="flex-1 rounded border border-stone-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleClaudeRestore()}
          />
          <button
            onClick={handleClaudeRestore}
            className="rounded bg-rose-500 px-3 py-1 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
          >
            {t("sessions.ask")}
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("sessions.searchPlaceholder")}
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-colors"
      />

      {/* Session List */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500" />
          {t("sessions.tabLoading")}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-xl text-stone-300">
            ◇
          </div>
          <p className="text-sm font-medium text-stone-500">
            {query ? t("sessions.noMatching") : t("sessions.noSaved")}
          </p>
          {!query && (
            <p className="mt-1 text-[12px] text-stone-400">
              Save your tabs to get started
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`rounded-lg border overflow-hidden ${
                session.starred
                  ? "border-amber-200/60 bg-amber-50/20"
                  : "border-stone-200 bg-white"
              }`}
            >
              {/* Session Header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-stone-50"
                onClick={() => toggleExpand(session.id!)}
              >
                <span className={`text-[11px] text-stone-400 transition-transform duration-200 inline-block ${
                  expandedId === session.id ? "rotate-90" : ""
                }`}>
                  ▶
                </span>

                {session.starred && (
                  <span className="text-amber-500 text-sm leading-none">★</span>
                )}
                {session.locked && (
                  <span className="text-[12px] leading-none">🔒</span>
                )}

                <div className="min-w-0 flex-1">
                  {editingId === session.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(session.id!);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleRename(session.id!)}
                      className="w-full rounded border border-stone-200 px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="truncate text-sm font-medium text-stone-800">
                      {session.name}
                    </p>
                  )}
                  <p className="text-[12px] text-stone-400">
                    {formatDate(session.createdAt, locale)} · {t("sessions.tabCount", { count: session.tabCount })}
                  </p>
                </div>

                {/* Session Actions */}
                <div
                  className="flex shrink-0 gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleToggleStar(session)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] transition-colors ${
                      session.starred
                        ? "text-amber-500"
                        : "text-stone-300 hover:bg-stone-100 hover:text-stone-600"
                    }`}
                    title={session.starred ? t("sessions.unstar") : t("sessions.star")}
                  >
                    ★
                  </button>
                  <button
                    onClick={() => handleToggleLock(session)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md text-[12px] transition-colors ${
                      session.locked
                        ? "text-stone-600"
                        : "text-stone-300 hover:bg-stone-100 hover:text-stone-600"
                    }`}
                    title={session.locked ? t("sessions.unlock") : t("sessions.lock")}
                  >
                    {session.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(session.id!);
                      setEditName(session.name);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[12px] text-stone-300 hover:bg-stone-100 hover:text-stone-600 transition-colors"
                    title={t("sessions.rename")}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleRestoreSession(session.id!)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[12px] text-stone-400 hover:bg-stone-100 hover:text-rose-500 transition-colors"
                    title={t("sessions.restoreAll")}
                  >
                    ↺
                  </button>
                  {!session.locked && (
                    <button
                      onClick={() => handleDeleteSession(session.id!)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[12px] text-stone-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title={t("sessions.delete")}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Tab List */}
              {expandedId === session.id && (
                <div className="border-t border-stone-100 bg-stone-50/50 px-3 py-2 space-y-0.5">
                  {expandedTabs.length === 0 ? (
                    <p className="text-xs text-stone-400 py-1">{t("sessions.tabLoading")}</p>
                  ) : (
                    expandedTabs.map((tab) => (
                      <ExpandedTabRow
                        key={tab.id}
                        tab={tab}
                        sessionId={session.id!}
                        onRestore={handleRestoreTab}
                        onDelete={handleDeleteTab}
                        t={t}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpandedTabRow({
  tab,
  sessionId,
  onRestore,
  onDelete,
  t,
}: {
  tab: TabWithId;
  sessionId: number;
  onRestore: (url: string) => void;
  onDelete: (tabId: number, sessionId: number) => void;
  t: (key: MessageKey) => string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white transition-colors">
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
        <p className="truncate text-[11px] text-stone-400">
          {tab.url}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => onRestore(tab.url)}
          className="flex h-6 items-center rounded-md px-2 text-[12px] font-medium text-stone-500 hover:text-rose-500 hover:bg-rose-50 transition-colors"
        >
          {t("sessions.open")}
        </button>
        <button
          onClick={() => onDelete(tab.id, sessionId)}
          className="flex h-6 items-center rounded-md px-2 text-[12px] font-medium text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          {t("sessions.delete")}
        </button>
      </div>
    </div>
  );
}

function formatDate(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }
  if (minutes < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-minutes, "minute");
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-hours, "hour");
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  const month = date.toLocaleString(locale, { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isThisYear) return `${month} ${day}, ${time}`;
  return `${month} ${day}, ${date.getFullYear()}`;
}
