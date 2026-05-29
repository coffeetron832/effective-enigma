#!/usr/bin/env node

import { createUI } from "./core/ui.js";
import { createPlayer } from "./core/player.js";
import { createVisualizer } from "./core/visualizer.js";
import { createCommands } from "./core/commands.js";
import { loadPlaylist } from "./core/playlist.js";

console.log("MASCII VERSION 2026");

async function main() {
  const ui = createUI();

  let playlist = [];
  try {
    playlist = await loadPlaylist("./music");
  } catch (error) {
    ui.appendLog(
      `{red-fg}Could not load ./music folder{/red-fg}\n\n${String(
        error?.message || error
      )}`
    );
  }

  const player = createPlayer({
    playlist,
    ui
  });

  const visualizer = createVisualizer({
    ui,
    player
  });

  createCommands({
    ui,
    player,
    visualizer
  });

  let cleanedUp = false;

  function cleanup(exitCode = null) {
    if (cleanedUp) return;
    cleanedUp = true;

    try {
      visualizer?.stop?.();
    } catch {}

    try {
      player?.stop?.();
    } catch {}

    try {
      ui?.destroy?.();
    } catch {}

    if (typeof exitCode === "number") {
      process.exit(exitCode);
    }
  }

  process.once("SIGINT", () => cleanup(0));
  process.once("SIGTERM", () => cleanup(0));

  process.once("uncaughtException", (error) => {
    try {
      cleanup();
    } finally {
      console.error("\nFatal Error:\n");
      console.error(error);
      process.exit(1);
    }
  });

  process.once("unhandledRejection", (error) => {
    try {
      cleanup();
    } finally {
      console.error("\nUnhandled Promise Rejection:\n");
      console.error(error);
      process.exit(1);
    }
  });

  ui.screen.key(["q", "C-c", "escape"], () => {
    cleanup(0);
  });

  ui.render();
}

main().catch((error) => {
  console.error("\nFatal startup error:\n");
  console.error(error);
  process.exit(1);
});
