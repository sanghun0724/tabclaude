#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  if (os === "win32") {
    return null;
  }

  return null;
}

function getHostPath() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const hostScript = resolve(__dirname, "..", "host.js");

  // When installed globally via npm, the bin entry creates a symlink/wrapper.
  // For the native messaging manifest, we need the actual node + script path.
  return hostScript;
}

async function register() {
  const manifestDir = getManifestDir();

  if (manifestDir === null) {
    if (platform() === "win32") {
      console.log(
        `[${HOST_NAME}] Windows detected — manual registry setup is needed.\n` +
        `Add a registry key at:\n` +
        `  HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}\n` +
        `with the default value pointing to the manifest JSON file.`
      );
      return;
    }
    console.log(`[${HOST_NAME}] Unsupported platform: ${platform()}. Skipping registration.`);
    return;
  }

  const hostPath = getHostPath();

  const manifest = {
    name: HOST_NAME,
    description: "Tabclaude — AI Tab Manager Native Messaging Host",
    path: hostPath,
    type: "stdio",
    allowed_origins: ["chrome-extension://*/"],
  };

  await mkdir(manifestDir, { recursive: true });

  const manifestPath = join(manifestDir, `${HOST_NAME}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`[${HOST_NAME}] Native messaging host registered.`);
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Host:     ${hostPath}`);
}

register().catch((err) => {
  console.error(`[${HOST_NAME}] Registration failed: ${err.message}`);
  // Don't exit with error code — npm postinstall failures block the whole install
  process.exitCode = 0;
});
