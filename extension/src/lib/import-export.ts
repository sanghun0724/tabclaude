import type { Session, SavedTab } from "./types";

export interface ParsedSession {
  name: string;
  tabs: { url: string; title: string }[];
}

/**
 * Export sessions to OneTab-compatible plain text format.
 * Format: `URL | Title` per line, blank line between sessions.
 * Session name as comment header: `// Session: name (date)`
 */
export function exportSessions(
  sessions: Array<Session & { tabs: Array<SavedTab & { id?: number }> }>,
): string {
  const blocks: string[] = [];

  for (const session of sessions) {
    const lines: string[] = [];
    const date = new Date(session.createdAt).toLocaleString();
    lines.push(`// Session: ${session.name} (${date})`);

    for (const tab of session.tabs) {
      lines.push(`${tab.url} | ${tab.title || tab.url}`);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

/**
 * Parse OneTab-compatible import text.
 * - One tab per line: `URL | Title` (split on LAST ` | `)
 * - Plain URL lines (no pipe) treated as URL with empty title
 * - Blank lines separate sessions
 * - `// Session: name` lines set session name
 */
export function parseImport(text: string): ParsedSession[] {
  const lines = text.split("\n");
  const sessions: ParsedSession[] = [];
  let current: ParsedSession | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Blank line = session separator
    if (!line) {
      if (current && current.tabs.length > 0) {
        sessions.push(current);
        current = null;
      }
      continue;
    }

    // Comment line — extract session name
    if (line.startsWith("//")) {
      const nameMatch = line.match(/^\/\/\s*Session:\s*(.+?)(?:\s*\(.*\))?$/);
      if (!current) {
        current = { name: nameMatch?.[1]?.trim() ?? "", tabs: [] };
      } else if (nameMatch) {
        current.name = nameMatch[1].trim();
      }
      continue;
    }

    // Start a new session if needed
    if (!current) {
      current = { name: "", tabs: [] };
    }

    // Parse tab line — split on LAST ` | ` to handle URLs with pipe
    const lastPipeIdx = line.lastIndexOf(" | ");
    if (lastPipeIdx > 0) {
      const url = line.substring(0, lastPipeIdx).trim();
      const title = line.substring(lastPipeIdx + 3).trim();
      if (isValidUrl(url)) {
        current.tabs.push({ url, title: title || url });
      }
    } else {
      // Plain URL, no pipe
      const url = line.trim();
      if (isValidUrl(url)) {
        current.tabs.push({ url, title: url });
      }
    }
  }

  // Push final session
  if (current && current.tabs.length > 0) {
    sessions.push(current);
  }

  // Auto-name unnamed sessions
  for (let i = 0; i < sessions.length; i++) {
    if (!sessions[i].name) {
      sessions[i].name = `Imported session ${i + 1}`;
    }
  }

  return sessions;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
