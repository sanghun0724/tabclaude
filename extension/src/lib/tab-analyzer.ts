import type { TabInfo, TabSummary, TabCategory } from "./types";

export function toTabInfo(tab: chrome.tabs.Tab, lastAccessed: number): TabInfo {
  return {
    id: tab.id ?? -1,
    windowId: tab.windowId ?? -1,
    url: tab.url ?? "",
    title: tab.title ?? "",
    favIconUrl: tab.favIconUrl,
    groupId: tab.groupId ?? -1,
    lastAccessed,
    active: tab.active ?? false,
    pinned: tab.pinned ?? false,
    incognito: tab.incognito ?? false,
  };
}

export function categorizeByDomain(tabs: TabInfo[]): TabCategory[] {
  const domainMap = new Map<string, TabInfo[]>();

  for (const tab of tabs) {
    try {
      const hostname = new URL(tab.url).hostname;
      const domain = classifyDomain(hostname);
      const existing = domainMap.get(domain) ?? [];
      existing.push(tab);
      domainMap.set(domain, existing);
    } catch {
      const existing = domainMap.get("Other") ?? [];
      existing.push(tab);
      domainMap.set("Other", existing);
    }
  }

  return Array.from(domainMap.entries())
    .map(([name, categoryTabs]) => ({
      name,
      count: categoryTabs.length,
      tabs: categoryTabs,
    }))
    .sort((a, b) => b.count - a.count);
}

function classifyDomain(hostname: string): string {
  const rules: Record<string, string[]> = {
    Development: [
      "github.com",
      "gitlab.com",
      "stackoverflow.com",
      "developer.apple.com",
      "npmjs.com",
      "pypi.org",
      "localhost",
      "docs.rs",
      "crates.io",
    ],
    Search: ["google.com", "bing.com", "duckduckgo.com"],
    Social: [
      "twitter.com",
      "x.com",
      "reddit.com",
      "facebook.com",
      "instagram.com",
      "linkedin.com",
      "threads.net",
    ],
    Video: ["youtube.com", "twitch.tv", "vimeo.com"],
    Shopping: [
      "amazon.com",
      "ebay.com",
      "coupang.com",
      "gmarket.co.kr",
      "11st.co.kr",
    ],
    News: [
      "news.ycombinator.com",
      "bbc.com",
      "cnn.com",
      "nytimes.com",
      "reuters.com",
    ],
    Docs: [
      "notion.so",
      "docs.google.com",
      "confluence.atlassian.net",
      "figma.com",
    ],
    AI: [
      "chat.openai.com",
      "claude.ai",
      "bard.google.com",
      "perplexity.ai",
    ],
  };

  for (const [category, domains] of Object.entries(rules)) {
    if (domains.some((d) => hostname.includes(d))) {
      return category;
    }
  }
  return "Other";
}

export function findDuplicates(tabs: TabInfo[]): TabInfo[][] {
  const urlMap = new Map<string, TabInfo[]>();

  for (const tab of tabs) {
    const normalized = normalizeUrl(tab.url);
    if (!normalized) continue;
    const existing = urlMap.get(normalized) ?? [];
    existing.push(tab);
    urlMap.set(normalized, existing);
  }

  return Array.from(urlMap.values()).filter((group) => group.length > 1);
}

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "chrome:" || parsed.protocol === "chrome-extension:")
      return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export function findInactiveTabs(
  tabs: TabInfo[],
  inactiveMinutes: number,
): TabInfo[] {
  const cutoff = Date.now() - inactiveMinutes * 60 * 1000;
  return tabs
    .filter((t) => !t.active && !t.pinned && t.lastAccessed < cutoff)
    .sort((a, b) => a.lastAccessed - b.lastAccessed);
}

export function buildSummary(
  tabs: TabInfo[],
  inactiveMinutes: number,
): TabSummary {
  const nonIncognito = tabs.filter((t) => !t.incognito);
  const byWindow: Record<number, number> = {};
  for (const tab of nonIncognito) {
    byWindow[tab.windowId] = (byWindow[tab.windowId] ?? 0) + 1;
  }

  return {
    total: nonIncognito.length,
    byWindow,
    categories: categorizeByDomain(nonIncognito),
    inactive: findInactiveTabs(nonIncognito, inactiveMinutes),
    duplicates: findDuplicates(nonIncognito),
  };
}
