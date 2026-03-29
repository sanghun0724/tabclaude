#!/usr/bin/env node

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { platform, homedir } from "node:os";

const HOST_NAME = "com.tabclaude.host";

function getManifestDir() {
  const os = platform();
  const home = homedir();

  if (os === "darwin") {
    return join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  }
  if (os === "linux") {
    return join(home, ".config", "google-chrome", "NativeMessagingHosts");
  }

  return null;
}

async function unregister() {
  const manifestDir = getManifestDir();

  if (manifestDir === null) {
    if (platform() === "win32") {
      console.log(
        `[${HOST_NAME}] Windows detected — remove the registry key manually:\n` +
        `  HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`
      );
    }
    return;
  }

  const manifestPath = join(manifestDir, `${HOST_NAME}.json`);

  try {
    await unlink(manifestPath);
    console.log(`[${HOST_NAME}] Native messaging host unregistered.`);
    console.log(`  Removed: ${manifestPath}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`[${HOST_NAME}] Manifest not found — nothing to remove.`);
    } else {
      console.error(`[${HOST_NAME}] Failed to remove manifest: ${err.message}`);
    }
  }
}

unregister().catch((err) => {
  console.error(`[${HOST_NAME}] Unregistration failed: ${err.message}`);
  process.exitCode = 0;
});
