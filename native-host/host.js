#!/usr/bin/env node

import { stdin, stdout, stderr } from "node:process";
import { analyzeWithClaude, askClaude } from "./claude-client.js";

// Chrome Native Messaging uses length-prefixed messages (4-byte LE header).
// We use a persistent readable listener to keep the process alive.

let buffer = Buffer.alloc(0);

stdin.on("readable", () => {
  let chunk;
  while ((chunk = stdin.read()) !== null) {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  }
});

stdin.on("end", () => {
  stderr.write("Tabclaude Native Host: stdin closed\n");
  process.exit(0);
});

function processBuffer() {
  while (buffer.length >= 4) {
    const msgLen = buffer.readUInt32LE(0);
    if (buffer.length < 4 + msgLen) break;

    const body = buffer.subarray(4, 4 + msgLen).toString("utf-8");
    buffer = buffer.subarray(4 + msgLen);

    try {
      const message = JSON.parse(body);
      handleMessage(message);
    } catch (err) {
      stderr.write(`Parse error: ${err.message}\n`);
    }
  }
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  const buf = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  stdout.write(header);
  stdout.write(buf);
}

async function handleMessage(message) {
  try {
    switch (message.type) {
      case "ANALYZE_TABS": {
        const analysis = await analyzeWithClaude(message.payload);
        sendMessage({ type: "ANALYZE_TABS", success: true, data: analysis });
        break;
      }
      case "ASK_CLAUDE": {
        const result = await askClaude(message.payload);
        sendMessage({ type: "ASK_CLAUDE", success: true, data: result });
        break;
      }
      case "PING": {
        sendMessage({ type: "PING", success: true, data: { pong: true } });
        break;
      }
      default:
        sendMessage({
          type: message.type,
          success: false,
          error: `Unknown message type: ${message.type}`,
        });
    }
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    sendMessage({
      type: message.type,
      success: false,
      error: err.message,
    });
  }
}

stderr.write("Tabclaude Native Host started\n");
