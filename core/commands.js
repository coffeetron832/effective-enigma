import fs from "fs";
import path from "path";

export function createCommands({ ui, player }) {
  let isLocked = false;

  // Redirige las salidas de texto a la interfaz visual
  function log(message = "") {
    ui.appendLog(message);
  }

  function importPath(targetPath) {
    const trimmedPath = String(targetPath || "").trim();

    if (!trimmedPath) {
      log(`{red-fg}Missing path{/red-fg}\nUse keyboard shortcuts or verify folder layout.`);
      return;
    }

    const resolved = path.resolve(trimmedPath);

    if (!fs.existsSync(resolved)) {
      log(`{red-fg}Path not found{/red-fg}\n${resolved}`);
      return;
    }

    const musicDir = path.resolve("./music");

    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, { recursive: true });
    }

    const supported = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]);
    let copied = 0;

    function copyFile(filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (!supported.has(ext)) return;

      const filename = path.basename(filePath);
      const destination = path.join(musicDir, filename);

      try {
        fs.copyFileSync(filePath, destination);
        copied++;
      } catch {
        log(`{red-fg}Copy failed:{/red-fg} ${filename}`);
      }
    }

    const stats = fs.statSync(resolved);

    if (stats.isDirectory()) {
      const files = fs.readdirSync(resolved);
      for (const file of files) {
        copyFile(path.join(resolved, file));
      }
    } else {
      copyFile(resolved);
    }

    log(`{green-fg}Imported ${copied} file(s){/green-fg} to ./music`);
    
    if (typeof player.loadTracks === "function") {
      player.loadTracks();
      updatePlaylistUI();
    }
  }

  // Refresca la lista de canciones en el contenedor correspondiente
  function updatePlaylistUI() {
    if (typeof player.getTracks === "function" && typeof player.getCurrentIndex === "function") {
      const tracks = player.getTracks();
      const currentIndex = player.getCurrentIndex();
      ui.setPlaylist(tracks, currentIndex);
    }
  }

  function runCommand(commandName, args = []) {
    // Los comandos de reproducción e hilos IPC nativos no deben bloquearse por la UI
    switch (commandName) {
      case "play":
      case "pause":
      case "toggle":
      case "space":
        if (typeof player.toggle === "function") {
          player.toggle();
        }
        break;

      case "next":
      case "n":
        if (typeof player.next === "function") player.next();
        break;

      case "prev":
      case "p":
        if (typeof player.prev === "function") player.prev();
        break;

      case "stop":
      case "s":
        if (typeof player.stop === "function") player.stop();
        break;

      case "load":
        if (isLocked) return;
        isLocked = true;
        importPath(args.join(" "));
        isLocked = false;
        break;

      case "clear":
        if (typeof ui.clearVisual === "function") ui.clearVisual();
        break;

      case "quit":
      case "exit":
      case "q":
        if (ui.screen && typeof ui.screen.destroy === "function") {
          ui.screen.destroy();
        }
        process.exit(0);
        return;

      default:
        break;
    }

    // Forzamos la actualización síncrona visual del tracklist en caliente
    updatePlaylistUI();
    if (ui.screen && typeof ui.screen.render === "function") {
      ui.screen.render();
    }
  }

  // Limpieza defensiva del bus de eventos de la pantalla global de Blessed
  if (ui.screen) {
    ui.screen.removeAllListeners("keypress");
  }

  // Interceptor reactivo de teclas directas (Atajos TUI estándar)
  ui.getInput((ch, key) => {
    const name = key ? key.name : "";

    if (name === "space") {
      runCommand("toggle");
    } else if (name === "n") {
      runCommand("next");
    } else if (name === "p") {
      runCommand("prev");
    } else if (name === "s") {
      runCommand("stop");
    } else if (name === "q" || (key && key.ctrl && name === "c")) {
      runCommand("quit");
    }
  });

  updatePlaylistUI();
}
