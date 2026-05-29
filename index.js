#!/usr/bin/env node

import { createUI } from "./core/ui.js";
import { createPlayer } from "./core/player.js";
import { createCommands } from "./core/commands.js";
import { loadPlaylist } from "./core/playlist.js";

console.log("MASCII VERSION 2026");

async function main() {
  const ui = createUI();
  let uiInterval = null;

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

  // 1. Inicializamos el reproductor pasándole únicamente la interfaz
  const player = createPlayer({
    playlist,
    ui
  });

  // 2. Registramos los comandos del teclado removiendo la dependencia del visualizador
  createCommands({
    ui,
    player
  });

  // 3. Encendemos un bucle asíncrono gráfico ligero (30 FPS) para refrescar el tiempo de reproducción
  uiInterval = setInterval(() => {
    if (typeof ui.render === "function") {
      // Forzamos al reproductor a actualizar internamente sus estados de texto y barras de progreso
      if (player && typeof player.getCurrentTime === "function") {
        const track = player.getTrack();
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        const trackName = track ? `${track.artist || "Local Track"} - ${track.name}` : "No Track";
        const percentage = duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : 0;
        
        ui.setNowPlaying(trackName, current, duration, percentage);
        
        const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
        const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
        const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
        const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

        ui.setVolumeState(volume, isLoop, isShuffle, eqMode);
      }
      ui.render();
    }
  }, 33);

  let cleanedUp = false;

  function cleanup(exitCode = null) {
    if (cleanedUp) return;
    cleanedUp = true;

    if (uiInterval) {
      clearInterval(uiInterval);
      uiInterval = null;
    }

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
