import {
  toTabInfo,
  buildSummary,
  findDuplicates,
} from "@/lib/tab-analyzer";
import {
  connectToHost,
  sendToHost,
  isHostConnected,
} from "@/lib/messaging";
import {
  saveTabs,
  getSettings,
  saveTabsToSession,
  getSessions,
  deleteSession,
  updateSession,
  getTabsBySession,
  deleteTabFromSession,
  searchSessions,
} from "@/lib/storage";
import type {
  TabInfo,
  TabSummary,
  Settings,
  ClaudeAnalysis,
  Suggestion,
  SavedTab,
} from "@/lib/types";

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const tabLastAccessed = new Map<number, number>();
let currentSettings: Settings | null = null;

async function loadSettings(): Promise<Settings> {
  if (!currentSettings) {
    currentSettings = await getSettings();
  }
  return currentSettings;
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    currentSettings = changes.settings.newValue;
  }
});

// --- Side Panel setup ---

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Tab activity tracking ---

function trackAccess(tabId: number) {
  tabLastAccessed.set(tabId, Date.now());
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  trackAccess(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    trackAccess(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabLastAccessed.delete(tabId);
});

// --- Save All Tabs command ---

async function saveAllTabsInWindow(windowId?: number): Promise<{ sessionId: number } | null> {
  const queryOpts: chrome.tabs.QueryInfo = { pinned: false };
  if (windowId !== undefined) {
    queryOpts.windowId = windowId;
  } else {
    queryOpts.currentWindow = true;
  }
  const tabs = await chrome.tabs.query(queryOpts);
  const saveable = tabs.filter(
    (t) => !t.incognito && t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("chrome-extension://"),
  );

  if (saveable.length === 0) return null;

  const tabsToSave = saveable.map((t) => ({
    url: t.url!,
    title: t.title ?? "",
    favIconUrl: t.favIconUrl,
    closedAt: Date.now(),
  }));

  const { sessionId } = await saveTabsToSession(tabsToSave);

  // Create a new tab so the window doesn't close
  await chrome.tabs.create({ windowId: windowId ?? saveable[0].windowId });

  // Close saved tabs
  const idsToClose = saveable.map((t) => t.id).filter((id): id is number => id !== undefined);
  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose);
  }

  return { sessionId };
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-all-tabs") {
    await saveAllTabsInWindow();
  }
});

// --- Tab event triggers ---

let analyzeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.incognito) return;

  const settings = await loadSettings();
  const tabs = await chrome.tabs.query({});
  const nonIncognito = tabs.filter((t) => !t.incognito);

  if (nonIncognito.length > settings.tabThreshold) {
    if (analyzeDebounceTimer) clearTimeout(analyzeDebounceTimer);
    analyzeDebounceTimer = setTimeout(() => analyzeAndSuggest(), 3000);
  }

  if (tab.url && settings.autoGroupEnabled) {
    const duplicates = findDuplicates(
      nonIncognito.map((t) => toTabInfo(t, tabLastAccessed.get(t.id!) ?? Date.now())),
    );
    if (duplicates.length > 0) {
      chrome.runtime.sendMessage({
        type: "TAB_SUMMARY_UPDATED",
      });
    }
  }
});

// --- Core analysis ---

async function getAllTabInfos(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => !t.incognito)
    .map((t) => toTabInfo(t, tabLastAccessed.get(t.id!) ?? Date.now()));
}

async function getTabSummary(): Promise<TabSummary> {
  const settings = await loadSettings();
  const tabs = await getAllTabInfos();
  return buildSummary(tabs, settings.inactiveMinutes);
}

let isAnalyzing = false;

async function analyzeAndSuggest(): Promise<void> {
  if (isAnalyzing) return;
  isAnalyzing = true;
  try {
  return await _analyzeAndSuggestInner();
  } finally { isAnalyzing = false; }
}

async function _analyzeAndSuggestInner(): Promise<void> {
  const tabs = await getAllTabInfos();
  const settings = await loadSettings();

  if (!isHostConnected()) {
    connectToHost();
  }

  if (!isHostConnected()) return;

  const tabData = tabs.map((t) => ({
    id: t.id,
    url: t.url,
    title: t.title,
    lastAccessed: t.lastAccessed,
    active: t.active,
    pinned: t.pinned,
  }));

  const response = await sendToHost({
    type: "ANALYZE_TABS",
    payload: {
      tabs: tabData,
      settings: {
        autonomyLevel: settings.autonomyLevel,
        tabThreshold: settings.tabThreshold,
      },
    },
  });

  if (!response.success || !response.data) return;

  const analysis = response.data as ClaudeAnalysis;
  const suggestions: Suggestion[] = [];

  for (const group of analysis.groups) {
    const groupTabs = tabs.filter((t) => group.tabIds.includes(t.id));
    if (groupTabs.length > 1) {
      suggestions.push({
        type: "group",
        title: `Group: ${group.name}`,
        description: `${groupTabs.length} related tabs`,
        tabs: groupTabs,
        groupName: group.name,
        groupColor: group.color,
        risk: "low",
      });
    }
  }

  for (const suggestion of analysis.closeSuggestions) {
    const tab = tabs.find((t) => t.id === suggestion.tabId);
    if (tab) {
      suggestions.push({
        type: "close",
        title: `Close: ${tab.title}`,
        description: suggestion.reason,
        tabs: [tab],
        risk: "high",
      });
    }
  }

  if (settings.autonomyLevel === "aggressive") {
    for (const s of suggestions.filter((s) => s.risk === "low")) {
      await applySuggestion(s);
    }
    suggestions
      .filter((s) => s.risk === "low")
      .forEach((s) => suggestions.splice(suggestions.indexOf(s), 1));
  }

  chrome.runtime.sendMessage({
    type: "SUGGESTIONS_UPDATED",
    suggestions,
  });
}

async function applySuggestion(suggestion: Suggestion): Promise<void> {
  switch (suggestion.type) {
    case "group": {
      if (!suggestion.groupName) return;
      const tabIds = suggestion.tabs.map((t) => t.id);
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: suggestion.groupName,
        color: suggestion.groupColor ?? "blue",
      });
      break;
    }
    case "close": {
      const tabsToSave: SavedTab[] = suggestion.tabs.map((t) => ({
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        closedAt: Date.now(),
      }));
      await saveTabs(tabsToSave);
      await chrome.tabs.remove(suggestion.tabs.map((t) => t.id));
      break;
    }
    case "restore":
      for (const tab of suggestion.tabs) {
        await chrome.tabs.create({ url: tab.url });
      }
      break;
  }
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "GET_TAB_SUMMARY":
      getTabSummary().then((summary) => sendResponse({ summary }));
      return true;

    case "GET_HOST_STATUS":
      if (!isHostConnected()) {
        connectToHost();
      }
      sendToHost({ type: "PING" }).then((res) => {
        sendResponse({ connected: res.success === true });
      });
      return true;

    case "CONNECT_HOST":
      console.log("[Tabclaude BG] CONNECT_HOST received");
      connectToHost();
      console.log("[Tabclaude BG] connectToHost() done, isConnected:", isHostConnected());
      // Verify with a PING — connectNative doesn't throw on failure
      sendToHost({ type: "PING" }).then((res) => {
        console.log("[Tabclaude BG] PING response:", res);
        sendResponse({ connected: res.success === true });
      });
      return true;

    case "ANALYZE_TABS":
      analyzeAndSuggest().then(() => sendResponse({ ok: true }));
      return true;

    case "APPLY_SUGGESTION":
      applySuggestion(message.suggestion).then(() =>
        sendResponse({ ok: true }),
      );
      return true;

    case "CLOSE_AND_SAVE": {
      const tabs = message.tabs as TabInfo[];
      const saved: SavedTab[] = tabs.map((t) => ({
        url: t.url,
        title: t.title,
        favIconUrl: t.favIconUrl,
        closedAt: Date.now(),
        category: message.category,
        groupName: message.groupName,
      }));
      saveTabs(saved)
        .then(() => chrome.tabs.remove(tabs.map((t) => t.id)))
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    case "RESTORE_TABS": {
      const urls = (message.urls as string[]).filter(isSafeUrl);
      Promise.all(urls.map((url) => chrome.tabs.create({ url }))).then(() =>
        sendResponse({ ok: true }),
      );
      return true;
    }

    case "ASK_CLAUDE": {
      sendToHost({
        type: "ASK_CLAUDE",
        payload: message.payload,
      }).then((response) => sendResponse(response));
      return true;
    }

    // --- Session handlers ---

    case "SAVE_ALL_TABS": {
      saveAllTabsInWindow(message.windowId)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "SAVE_SELECTED_TABS": {
      const tabIds = message.tabIds as number[];
      chrome.tabs.query({}).then(async (allTabs) => {
        const selected = allTabs.filter((t) => t.id !== undefined && tabIds.includes(t.id) && !t.incognito);
        const tabsToSave = selected.map((t) => ({
          url: t.url ?? "",
          title: t.title ?? "",
          favIconUrl: t.favIconUrl,
          closedAt: Date.now(),
        }));
        const { sessionId } = await saveTabsToSession(tabsToSave, message.sessionName);
        const savedIds = selected.map((t) => t.id).filter((id): id is number => id !== undefined);
        if (savedIds.length > 0) await chrome.tabs.remove(savedIds);
        sendResponse({ ok: true, sessionId });
      }).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "GET_SESSIONS": {
      const limit = message.limit ?? 50;
      const offset = message.offset ?? 0;
      const query = message.query as string | undefined;
      (query ? searchSessions(query) : getSessions(limit, offset))
        .then((sessions) => sendResponse({ ok: true, sessions }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "GET_SESSION_TABS": {
      getTabsBySession(message.sessionId)
        .then((tabs) => sendResponse({ ok: true, tabs }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "DELETE_SESSION": {
      deleteSession(message.sessionId)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "UPDATE_SESSION": {
      updateSession(message.sessionId, message.patch)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "RESTORE_SESSION": {
      getTabsBySession(message.sessionId)
        .then(async (tabs) => {
          for (const tab of tabs) {
            await chrome.tabs.create({ url: tab.url });
          }
          sendResponse({ ok: true, count: tabs.length });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "RESTORE_TAB_FROM_SESSION": {
      const url = message.url as string;
      if (!isSafeUrl(url)) {
        sendResponse({ ok: false, error: "Invalid URL" });
        return false;
      }
      chrome.tabs.create({ url })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "DELETE_TAB_FROM_SESSION": {
      deleteTabFromSession(message.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  }
});
