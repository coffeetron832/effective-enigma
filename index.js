#!/usr/bin/env node

import { createUI } from "./core/ui.js";
import { createPlayer } from "./core/player.js";
import { createCommands } from "./core/commands.js";
import { loadPlaylist } from "./core/playlist.js";
import blessed from "blessed";

async function main() {
  const ui = createUI();
  
  // LOGO ASCII con colores ANSI
  // Azul Chicle: \x1b[38;2;77;155;255m
  const COLORS = {
    gumBlue: "\x1b[38;2;77;155;255m",
    orange:  "\x1b[38;2;255;165;0m",
    green:   "\x1b[38;2;0;255;127m",
    dim:     "\x1b[2m",
    reset:   "\x1b[0m"
  };

  const logo = [
    `${COLORS.gumBlue} ███▄ ▄███▓ ▄▄▄        ██████  ▄████▄   ██▓ ██▓${COLORS.reset}`,
    `${COLORS.orange}▓██▒▀█▀ ██▒▒████▄    ▒██    ▒ ▒██▀ ▀█  ▓██▒▓██▒${COLORS.reset}`,
    `${COLORS.orange}▓██    ▓██░▒██  ▀█▄  ░ ▓██▄   ▒▓█    ▄ ▒██▒▒██▒${COLORS.reset}`,
    `${COLORS.gumBlue}▒██    ▒██ ░██▄▄▄▄██   ▒   ██▒▒▓▓▄ ▄██▒░██░░██░${COLORS.reset}`,
    `${COLORS.orange}▒██▒   ░██▒ ▓█   ▓██▒▒██████▒▒▒ ▓███▀ ░░██░░██░${COLORS.reset}`,
    `${COLORS.green}░ ▒░   ░  ░ ▒▒   ▓▒█░▒ ▒▓▒ ▒ ░░ ░▒ ▒  ░░▓  ░▓  ${COLORS.reset}`,
    `${COLORS.green}░  ░      ░  ▒   ▒▒ ░░ ░▒  ░ ░  ░  ▒    ▒ ░ ▒ ░${COLORS.reset}`,
    `${COLORS.green}░      ░     ░   ▒   ░  ░  ░  ░         ▒ ░ ▒ ░${COLORS.reset}`,
    `${COLORS.green}       ░         ░  ░      ░  ░ ░       ░   ░  ${COLORS.reset}${COLORS.dim} v1.0.0${COLORS.reset}`,
    `${COLORS.green}                              ░                ${COLORS.reset}`
  ].join("\n");

  // Crear caja de bienvenida centrada
  const welcomeBox = blessed.box({
    parent: ui.screen,
    top: "center",
    left: "center",
    width: 60,
    height: 12,
    // Eliminamos el {center} de la etiqueta de tags porque el logo ya tiene su estructura
    content: `{center}${logo}\n\n{white-fg}Initializing...{/}`,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" } }
  });

  ui.render();

  // Esperar 3 segundos y eliminar logo
  await new Promise(resolve => setTimeout(resolve, 3000));
  welcomeBox.destroy();
  ui.render();

  let uiInterval = null;
  let playlist = [];
  try {
    playlist = await loadPlaylist("./music");
  } catch (error) {
    ui.appendLog(`{red-fg}Could not load ./music folder{/red-fg}`);
  }

  const player = createPlayer({ playlist, ui });
  createCommands({ ui, player });

  uiInterval = setInterval(() => {
    if (typeof ui.render === "function") {
      if (player && typeof player.getCurrentTime === "function") {
        const track = player.getTrack();
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        const trackName = track ? `${track.artist || "Local Track"} - ${track.name}` : "No Track";
        const percentage = duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : 0;
        
        ui.setNowPlaying(trackName, current, duration, percentage);
        ui.setVolumeState(player.getVolume(), player.isLoop(), player.isShuffle(), player.getEQ());
      }
      ui.render();
    }
  }, 33);

  let cleanedUp = false;
  function cleanup(exitCode = null) {
    if (cleanedUp) return;
    cleanedUp = true;
    if (uiInterval) clearInterval(uiInterval);
    try { player?.stop?.(); } catch {}
    try { ui?.destroy?.(); } catch {}
    if (typeof exitCode === "number") process.exit(exitCode);
  }

  process.once("SIGINT", () => cleanup(0));
  process.once("SIGTERM", () => cleanup(0));
  ui.screen.key(["q", "C-c", "escape"], () => cleanup(0));
  ui.render();
}

main().catch(console.error);
