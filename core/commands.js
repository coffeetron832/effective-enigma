import fs from "fs";
import path from "path";

export function createCommands({ ui, player }) {
  const input = ui.getInput();

  let isLocked = false;

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
      log(`
{red-fg}Missing path{/red-fg}

Example:
load ./music
      `);
      return;
    }

    const resolved = path.resolve(trimmedPath);

    if (!fs.existsSync(resolved)) {
      log(`
{red-fg}Path not found{/red-fg}

${resolved}
      `);
      return;
    }

    const musicDir = path.resolve("./music");

    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, {
        recursive: true
      });
    }

    const supported = new Set([
      ".mp3",
      ".wav",
      ".ogg",
      ".flac",
      ".m4a",
      ".aac"
    ]);

    let copied = 0;

    function copyFile(filePath) {
      const ext = path.extname(filePath).toLowerCase();

      if (!supported.has(ext)) {
        return;
      }

      const filename = path.basename(filePath);

      const destination = path.join(
        musicDir,
        filename
      );

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

    log(`
{green-fg}Import Complete{/green-fg}

Copied:
${copied} audio file(s)

Destination:
./music
    `);
  }

  function runCommand(raw = "") {
    if (isLocked) {
      return;
    }

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
        player.toggle();
        break;

      case "next":
      case "n":
        player.next();
        break;

      case "prev":
      case "p":
        player.prev();
        break;

      case "stop":
        player.stop();
        break;

      case "load":
        importPath(args.join(" "));
        break;

      case "help":
        log(`
{green-fg}MASCII COMMANDS{/green-fg}

Playback:
play
pause
next
prev
stop

Import:
load <path>

Example:
load ./downloads

System:
help
clear
quit
        `);
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
        log(`
{red-fg}Unknown command:{/red-fg}

${command}
        `);
    }

    setTimeout(() => {
      isLocked = false;
      clearInput();
      ui.focusInput();
      ui.render();
    }, 60);
  }

  input.removeAllListeners("submit");

  input.on("submit", value => {
    runCommand(value);
  });

  clearInput();

  ui.focusInput();
}
