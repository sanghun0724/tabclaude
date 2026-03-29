import { execFile } from "node:child_process";
import { stderr } from "node:process";

const CLAUDE_TIMEOUT = 30000;

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["--print", prompt],
      { timeout: CLAUDE_TIMEOUT, maxBuffer: 1024 * 1024 },
      (err, stdoutData, stderrData) => {
        if (err) {
          if (stderrData) stderr.write(`claude stderr: ${stderrData}\n`);
          reject(new Error(`Claude CLI failed: ${err.message}`));
          return;
        }
        resolve(stdoutData.trim());
      },
    );
    // Close stdin so claude CLI doesn't wait for input
    child.stdin.end();
  });
}

function parseJsonResponse(text) {
  // Try extracting JSON from markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

export async function analyzeWithClaude(payload) {
  const { tabs, settings } = payload;

  const prompt = `You are a tab management assistant. Analyze these browser tabs and respond with ONLY valid JSON (no markdown, no explanation).

Tabs:
${JSON.stringify(tabs, null, 2)}

User settings:
- Autonomy level: ${settings.autonomyLevel}
- Tab threshold: ${settings.tabThreshold}

Respond with this exact JSON structure:
{
  "categories": [{"name": "string", "tabIds": [numbers]}],
  "groups": [{"name": "string", "color": "blue|red|yellow|green|pink|purple|cyan|orange|grey", "tabIds": [numbers]}],
  "closeSuggestions": [{"tabId": number, "reason": "string"}]
}

Rules:
- Group related tabs by topic/project
- Suggest closing tabs that are clearly inactive or duplicated
- Be ${settings.autonomyLevel === "conservative" ? "very conservative — only suggest obvious duplicates" : settings.autonomyLevel === "aggressive" ? "aggressive — suggest closing anything not recently used" : "balanced — suggest closing old/duplicate tabs"}
- Use short, descriptive group names
- Color-code groups logically (dev=blue, social=pink, docs=green, etc.)`;

  const response = await runClaude(prompt);
  return parseJsonResponse(response);
}

export async function askClaude(payload) {
  const { action, query, savedTabs } = payload;

  if (action === "restore") {
    const prompt = `You are a tab management assistant. The user wants to restore tabs matching this request: "${query}"

Saved tabs:
${JSON.stringify(savedTabs ?? [], null, 2)}

Respond with ONLY valid JSON:
{"urls": ["url1", "url2"]}

Return only URLs that match the user's request. If no tabs match, return {"urls": []}.`;

    const response = await runClaude(prompt);
    return parseJsonResponse(response);
  }

  // General query
  const prompt = `You are a tab management assistant. Answer this question concisely: "${query}"
Respond with ONLY valid JSON: {"answer": "your answer here"}`;

  const response = await runClaude(prompt);
  return parseJsonResponse(response);
}
