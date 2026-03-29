export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  groupId: number;
  lastAccessed: number;
  active: boolean;
  pinned: boolean;
  incognito: boolean;
}

export interface TabCategory {
  name: string;
  count: number;
  tabs: TabInfo[];
}

export interface TabSummary {
  total: number;
  byWindow: Record<number, number>;
  categories: TabCategory[];
  inactive: TabInfo[];
  duplicates: TabInfo[][];
}

export interface SavedTab {
  url: string;
  title: string;
  favIconUrl?: string;
  closedAt: number;
  category?: string;
  groupName?: string;
  sessionId?: number;
}

export interface Session {
  id?: number;
  name: string;
  createdAt: number;
  locked: boolean;
  starred: boolean;
  windowId?: number;
}

export interface Suggestion {
  type: "close" | "group" | "restore";
  title: string;
  description: string;
  tabs: TabInfo[];
  groupName?: string;
  groupColor?: chrome.tabGroups.ColorEnum;
  risk: "low" | "high";
}

export interface GroupProposal {
  name: string;
  color: chrome.tabGroups.ColorEnum;
  tabIds: number[];
}

export interface ClaudeAnalysis {
  categories: { name: string; tabIds: number[] }[];
  groups: GroupProposal[];
  closeSuggestions: { tabId: number; reason: string }[];
}

export interface Settings {
  autonomyLevel: "conservative" | "balanced" | "aggressive";
  tabThreshold: number;
  excludePatterns: string[];
  autoGroupEnabled: boolean;
  inactiveMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autonomyLevel: "balanced",
  tabThreshold: 20,
  excludePatterns: [],
  autoGroupEnabled: true,
  inactiveMinutes: 60,
};

export interface NativeMessage {
  type: string;
  payload?: unknown;
}

export interface NativeResponse {
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
