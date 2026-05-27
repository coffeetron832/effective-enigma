#!/usr/bin/env node

console.log("MASCII VERSION 2026");

import { createUI } from "./core/ui.js";
import { createPlayer } from "./core/player.js";
import { createVisualizer } from "./core/visualizer.js";
import { createCommands } from "./core/commands.js";
import { loadPlaylist } from "./core/playlist.js";

async function main() {

  const ui = createUI();

  let playlist = [];

  try {

    playlist = await loadPlaylist("./music");

  } catch (error) {

    ui.appendLog(`
{red-fg}Could not load ./music folder{/red-fg}

${String(error?.message || error)}
    `);
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

    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    try {
      visualizer.stop();
    } catch {}

    try {
      player.stop?.();
    } catch {}

    try {
      ui.destroy();
    } catch {}

    if (typeof exitCode === "number") {
      process.exit(exitCode);
    }
  }

  process.once("SIGINT", () => {
    cleanup(0);
  });

  process.once("SIGTERM", () => {
    cleanup(0);
  });

  process.once("uncaughtException", error => {

    try {

      cleanup();

    } finally {

      console.error("\nFatal Error:\n");
      console.error(error);

      process.exit(1);
    }
  });

  process.once("unhandledRejection", error => {

    try {

      cleanup();

    } finally {

      console.error("\nUnhandled Promise Rejection:\n");
      console.error(error);

      process.exit(1);
    }
  });

  ui.screen.key(["q"], () => {
    cleanup(0);
  });

  // =========================================================================
  // PRUEBA DE DIAGNÓSTICO PARA LA INTERFERENCIA DE AUDIO:
  // Comentamos temporalmente el inicio del visualizador. Si el audio suena bien
  // tras este cambio, el problema es que el visualizador y mpv saturan el 
  // hardware de audio simultáneamente.
  // =========================================================================
  visualizer.start(); 

  // Renderizamos la interfaz gráfica inicial
  ui.render();

  // CORRECCIÓN PARA LETRAS DUPLICADAS:
  // Se elimina 'ui.focusInput()' de aquí. El foco lo gestiona exclusivamente
  // el inicializador dentro de 'core/commands.js' para evitar eventos fantasma.
}

main();

