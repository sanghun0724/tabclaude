import type { NativeMessage, NativeResponse } from "./types";

const HOST_NAME = "com.tabclaude.host";

let port: chrome.runtime.Port | null = null;
let connected = false;
let pendingCallbacks = new Map<
  string,
  (response: NativeResponse) => void
>();

export function isHostConnected(): boolean {
  return connected;
}

export function connectToHost(): boolean {
  try {
    console.log("[Tabclaude] connectNative:", HOST_NAME);
    port = chrome.runtime.connectNative(HOST_NAME);

    port.onMessage.addListener((message: NativeResponse) => {
      console.log("[Tabclaude] host message:", message);
      if (message.type && pendingCallbacks.has(message.type)) {
        const callback = pendingCallbacks.get(message.type)!;
        pendingCallbacks.delete(message.type);
        callback(message);
      }
    });

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message ?? "Disconnected";
      console.error("[Tabclaude] host disconnected:", error);
      connected = false;
      port = null;
      for (const callback of pendingCallbacks.values()) {
        callback({ type: "error", success: false, error });
      }
      pendingCallbacks.clear();
    });

    connected = true;
    return true;
  } catch {
    connected = false;
    return false;
  }
}

export function sendToHost(message: NativeMessage): Promise<NativeResponse> {
  return new Promise((resolve) => {
    if (!port || !connected) {
      if (!connectToHost()) {
        resolve({
          type: message.type,
          success: false,
          error: "Native host not connected. Is Claude CLI installed?",
        });
        return;
      }
    }

    pendingCallbacks.set(message.type, resolve);
    port!.postMessage(message);

    setTimeout(() => {
      if (pendingCallbacks.has(message.type)) {
        pendingCallbacks.delete(message.type);
        resolve({
          type: message.type,
          success: false,
          error: "Request timed out",
        });
      }
    }, 30000);
  });
}

export function disconnectHost(): void {
  if (port) {
    port.disconnect();
    port = null;
    connected = false;
  }
}
