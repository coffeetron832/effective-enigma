import fs from "fs";
import path from "path";

export function createCommands({ ui, player }) {
  const input = ui.getInput();
  let isLocked = false;

  // Redirige los logs generales a la caja de información del archivo (File Info / Log)
  function log(message = "") {
    ui.appendLog(message);
  }

  function clearInput() {
    input.setValue("");
    input.value = "";
  }

  function importPath(targetPath) {
    const trimmedPath = String(targetPath || "").trim();

    if (!trimmedPath) {
      log(`{red-fg}Missing path{/red-fg}\nUse: load <path>`);
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
    
    // Si el reproductor tiene un método para recargar las pistas locales, lo llamamos aquí
    if (typeof player.loadTracks === "function") {
      player.loadTracks();
      updatePlaylistUI();
    }
  }

  // Sincroniza visualmente la lista de reproducción en la interfaz
  function updatePlaylistUI() {
    if (typeof player.getTracks === "function" && typeof player.getCurrentIndex === "function") {
      const tracks = player.getTracks();
      const currentIndex = player.getCurrentIndex();
      ui.setPlaylist(tracks, currentIndex);
    }
  }

  function runCommand(raw = "") {
    if (isLocked) return;
    isLocked = true;

    const trimmed = String(raw || "").trim();
    clearInput();

    if (!trimmed) {
      ui.render();
      ui.focusInput();
      isLocked = false;
      return;
    }

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "play":
      case "pause":
      case "toggle":
        if (typeof player.toggle === "function") player.toggle();
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
        if (typeof player.stop === "function") player.stop();
        break;

      case "load":
        importPath(args.join(" "));
        break;

      case "help":
      case "h":
        log(`{green-fg}HELP:{/green-fg} play, pause, next, prev, stop, load <path>, clear, quit`);
        break;

      case "clear":
        ui.clearVisual();
        ui.clearLog();
        break;

      case "quit":
      case "exit":
      case "q":
        ui.destroy();
        process.exit(0);
        return;

      default:
        log(`{red-fg}Unknown:{/red-fg} ${command}`);
    }

    // El timeout ahora se encarga de pintar la UI una vez que los punteros asíncronos cambiaron
    setTimeout(() => {
      updatePlaylistUI();
      isLocked = false;
      clearInput();
      ui.focusInput();
      ui.render();
    }, 60);
  }

  // Remueve listeners previos para evitar fugas de memoria al reinicializar el módulo
  input.removeAllListeners("submit");

  input.on("submit", value => {
    runCommand(value);
  });

  // Inicialización de la vista
  clearInput();
  ui.focusInput();
  updatePlaylistUI();
}
