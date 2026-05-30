import fs from "fs";
import path from "path";

export function createCommands({ ui, player }) {
  let isLocked = false;

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

  function updatePlaylistUI() {
    if (typeof player.getTracks === "function" && typeof player.getCurrentIndex === "function") {
      const tracks = player.getTracks();
      const currentIndex = player.getCurrentIndex();
      ui.setPlaylist(tracks, currentIndex);
    }
    
    if (typeof ui.setVolumeState === "function") {
      ui.setVolumeState(
        player.getVolume(),
        player.isLoop(),
        player.isShuffle(),
        player.getEQ()
      );
    }
  }

  function runCommand(commandName, args = []) {
    switch (commandName) {
      case "toggle":
        if (typeof player.toggle === "function") player.toggle();
        break;

      case "next":
        if (typeof player.next === "function") player.next();
        break;

      case "prev":
        if (typeof player.prev === "function") player.prev();
        break;

      case "stop":
        if (typeof player.stop === "function") player.stop();
        break;

      case "volup":
        if (typeof player.setVolume === "function") {
          const currentVol = player.getVolume();
          player.setVolume(Math.min(100, currentVol + 5));
        }
        break;

      case "voldown":
        if (typeof player.setVolume === "function") {
          const currentVol = player.getVolume();
          player.setVolume(Math.max(0, currentVol - 5));
        }
        break;

      case "loop":
        if (typeof player.toggleLoop === "function") player.toggleLoop();
        break;

      case "shuffle":
        if (typeof player.toggleShuffle === "function") player.toggleShuffle();
        break;

      case "eq":
        if (typeof player.cycleEQ === "function") player.cycleEQ();
        break;

      case "load":
        if (isLocked) return;
        isLocked = true;
        importPath(args.join(" "));
        isLocked = false;
        break;

      case "quit":
        // CRÍTICO: Primero matamos de raíz el subproceso mpv y liberamos sockets Unix
        if (typeof player.stop === "function") {
          player.stop();
        }
        
        // Destruimos la interfaz de Blessed de forma segura
        if (ui.screen && typeof ui.screen.destroy === "function") {
          ui.screen.destroy();
        }
        
        // Salimos de Node.js limpiamente
        process.exit(0);
        return;

      default:
        break;
    }

    updatePlaylistUI();
    if (ui.screen && typeof ui.screen.render === "function") {
      ui.screen.render();
    }
  }

  if (ui.screen) {
    ui.screen.removeAllListeners("keypress");
  }

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
    } else if (ch === "+" || name === "up") {
      runCommand("volup");
    } else if (ch === "-" || name === "down") {
      runCommand("voldown");
    } else if (ch === "l") {
      runCommand("loop");
    } else if (ch === "z") {
      runCommand("shuffle");
    } else if (ch === "e") {
      runCommand("eq");
    } else if (name === "q" || (key && key.ctrl && name === "c")) {
      runCommand("quit");
    }
  });

  updatePlaylistUI();
}
