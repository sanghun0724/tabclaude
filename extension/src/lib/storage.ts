import { openDB, type IDBPDatabase } from "idb";
import type { SavedTab, Session, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const DB_NAME = "tabclaude";
const DB_VERSION = 2;
const TABS_STORE = "saved-tabs";
const SESSIONS_STORE = "sessions";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(TABS_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("url", "url", { unique: false });
          store.createIndex("closedAt", "closedAt", { unique: false });
          store.createIndex("category", "category", { unique: false });
        }
        if (oldVersion < 2) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
          sessionsStore.createIndex("createdAt", "createdAt", { unique: false });
          sessionsStore.createIndex("starred", "starred", { unique: false });

          const tabStore = transaction.objectStore(TABS_STORE);
          tabStore.createIndex("sessionId", "sessionId", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// --- Saved Tabs ---

export async function saveTabs(tabs: SavedTab[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(TABS_STORE, "readwrite");
  for (const tab of tabs) {
    tx.store.add(tab);
  }
  await tx.done;
}

export async function getSavedTabs(
  limit = 100,
  offset = 0,
): Promise<SavedTab[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(TABS_STORE, "closedAt");
  return all.reverse().slice(offset, offset + limit);
}

export async function searchSavedTabs(query: string): Promise<SavedTab[]> {
  const db = await getDB();
  const all = await db.getAll(TABS_STORE);
  const q = query.toLowerCase();
  return all.filter(
    (tab) =>
      tab.title.toLowerCase().includes(q) ||
      tab.url.toLowerCase().includes(q),
  );
}

export async function deleteSavedTab(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(TABS_STORE, id);
}

// --- Sessions ---

export async function createSession(
  session: Omit<Session, "id">,
): Promise<number> {
  const db = await getDB();
  return (await db.add(SESSIONS_STORE, session)) as number;
}

export async function getSession(id: number): Promise<Session | undefined> {
  const db = await getDB();
  return db.get(SESSIONS_STORE, id);
}

export async function getSessions(
  limit = 50,
  offset = 0,
): Promise<Array<Session & { tabCount: number }>> {
  const db = await getDB();
  const all: Session[] = await db.getAll(SESSIONS_STORE);

  // Sort: starred first, then by createdAt desc
  all.sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  const paged = all.slice(offset, offset + limit);

  const results: Array<Session & { tabCount: number }> = [];
  for (const session of paged) {
    const tabCount = await db.countFromIndex(TABS_STORE, "sessionId", session.id);
    results.push({ ...session, tabCount });
  }
  return results;
}

export async function updateSession(
  id: number,
  patch: Partial<Pick<Session, "name" | "locked" | "starred">>,
): Promise<void> {
  const db = await getDB();
  const session = await db.get(SESSIONS_STORE, id);
  if (!session) return;
  const updated = { ...session, ...patch };
  await db.put(SESSIONS_STORE, updated);
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getDB();
  const session = await db.get(SESSIONS_STORE, id);
  if (!session) return;
  if (session.locked) {
    throw new Error("Cannot delete a locked session");
  }

  const tx = db.transaction([SESSIONS_STORE, TABS_STORE], "readwrite");
  await tx.objectStore(SESSIONS_STORE).delete(id);

  const tabStore = tx.objectStore(TABS_STORE);
  const tabIndex = tabStore.index("sessionId");
  let cursor = await tabIndex.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function getTabsBySession(
  sessionId: number,
): Promise<Array<SavedTab & { id: number }>> {
  const db = await getDB();
  const tabs = await db.getAllFromIndex(TABS_STORE, "sessionId", sessionId);
  return tabs as Array<SavedTab & { id: number }>;
}

export async function saveTabsToSession(
  tabs: Omit<SavedTab, "sessionId">[],
  sessionName?: string,
): Promise<{ sessionId: number; session: Session }> {
  const db = await getDB();
  const now = Date.now();

  const session: Omit<Session, "id"> = {
    name: sessionName ?? generateSessionName(tabs, now),
    createdAt: now,
    locked: false,
    starred: false,
  };

  const tx = db.transaction([SESSIONS_STORE, TABS_STORE], "readwrite");
  const sessionId = (await tx
    .objectStore(SESSIONS_STORE)
    .add(session)) as number;

  const tabStore = tx.objectStore(TABS_STORE);
  for (const tab of tabs) {
    await tabStore.add({ ...tab, sessionId, closedAt: now });
  }

  await tx.done;

  return { sessionId, session: { ...session, id: sessionId } };
}

export async function deleteTabFromSession(tabId: number): Promise<void> {
  const db = await getDB();
  await db.delete(TABS_STORE, tabId);
}

export async function addTabToSession(
  sessionId: number,
  tab: Omit<SavedTab, "sessionId">,
): Promise<void> {
  const db = await getDB();
  await db.add(TABS_STORE, { ...tab, sessionId });
}

export async function searchSessions(
  query: string,
): Promise<Array<Session & { tabCount: number }>> {
  const db = await getDB();
  const q = query.toLowerCase();
  const allSessions: Session[] = await db.getAll(SESSIONS_STORE);

  const matched: Array<Session & { tabCount: number }> = [];

  for (const session of allSessions) {
    const nameMatch = session.name.toLowerCase().includes(q);
    const sessionTabs = await db.getAllFromIndex(
      TABS_STORE,
      "sessionId",
      session.id,
    );
    const tabMatch =
      !nameMatch &&
      sessionTabs.some(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.url.toLowerCase().includes(q),
      );

    if (nameMatch || tabMatch) {
      matched.push({ ...session, tabCount: sessionTabs.length });
    }
  }

  matched.sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return matched;
}

// --- Session auto-naming ---

function generateSessionName(
  tabs: Omit<SavedTab, "sessionId">[],
  timestamp: number,
): string {
  const domainCounts = new Map<string, number>();
  for (const tab of tabs) {
    try {
      const hostname = new URL(tab.url).hostname.replace("www.", "");
      domainCounts.set(hostname, (domainCounts.get(hostname) ?? 0) + 1);
    } catch {
      // skip invalid URLs
    }
  }

  if (domainCounts.size > 0) {
    const topDomain = [...domainCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    const ratio = topDomain[1] / tabs.length;
    if (ratio >= 0.5) {
      return `${topDomain[0]} (${tabs.length} tabs)`;
    }
  }

  const date = new Date(timestamp);
  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${month} ${day}, ${h12}:${minutes} ${ampm} (${tabs.length} tabs)`;
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get("settings", (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result.settings ?? {}) });
    });
  });
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: updated }, resolve);
  });
}
