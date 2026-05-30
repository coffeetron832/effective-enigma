import fs from "fs";
import path from "path";
import blessed from "blessed";
import { spawn } from "child_process";

const YTDLP_PATH = process.env.YTDLP_PATH || "/usr/local/bin/yt-dlp";

export function createCommands({ ui, player }) {
  let isLocked = false;

  function log(message = "") {
    ui.appendLog(message);
  }

  function updatePlaylistUI() {
    if (
      typeof player.getTracks === "function" &&
      typeof player.getCurrentIndex === "function"
    ) {
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

    if (typeof ui.render === "function") {
      ui.render();
    }
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

  function runYtDlpJson(url) {
    return new Promise((resolve) => {
      const proc = spawn(
        YTDLP_PATH,
        [
          "--dump-single-json",
          "--no-playlist",
          "--no-warnings",
          url
        ],
        {
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("error", () => {
        resolve(null);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        try {
          const json = JSON.parse(stdout);
          resolve(json);
        } catch {
          resolve(null);
        }
      });
    });
  }

  function isYoutubeUrl(url) {
    return (
      typeof url === "string" &&
      (
        url.includes("youtube.com") ||
        url.includes("youtu.be")
      )
    );
  }

  function extractFallbackTitle(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.searchParams.has("v")) {
        return `YT: ${urlObj.searchParams.get("v")}`;
      }

      const lastPart = urlObj.pathname.split("/").filter(Boolean).pop();
      return `YT: ${lastPart || "Stream"}`;
    } catch {
      return "YouTube Stream";
    }
  }

  async function openYoutubePrompt() {
    if (isLocked) return;
    isLocked = true;

    const promptBox = blessed.textbox({
      parent: ui.screen,
      top: "center",
      left: "center",
      width: 72,
      height: 3,
      border: { type: "line" },
      style: {
        border: { fg: "orange" },
        bg: "black"
      },
      label: " Paste YouTube URL and hit Enter ",
      tags: true,
      inputOnFocus: true,
      keys: true
    });

    ui.screen.append(promptBox);
    promptBox.focus();
    ui.screen.render();

    const finish = () => {
      try {
        promptBox.destroy();
      } catch {}
      isLocked = false;
      if (ui.screen && typeof ui.screen.render === "function") {
        ui.screen.render();
      }
    };

    promptBox.on("submit", async (value) => {
      const url = String(value || "").trim();
      finish();

      if (!url) {
        return;
      }

      if (!isYoutubeUrl(url) && !url.startsWith("http")) {
        log(`{red-fg}Invalid streaming URL{/red-fg}`);
        return;
      }

      const fallbackTitle = extractFallbackTitle(url);

      log(`{yellow-fg}Resolving YouTube metadata...{/yellow-fg}`);

      const meta = isYoutubeUrl(url) ? await runYtDlpJson(url) : null;

      const title =
        meta?.title ||
        fallbackTitle;

      const artist =
        meta?.uploader ||
        meta?.channel ||
        meta?.uploader_id ||
        "YouTube";

      const duration =
        Number.isFinite(meta?.duration)
          ? Math.max(1, Math.round(meta.duration))
          : 0;

      const thumbnail =
        meta?.thumbnail ||
        null;

      if (typeof player.addTrack === "function") {
        player.addTrack({
          name: title,
          path: url,
          duration,
          artist,
          thumbnail,
          source: isYoutubeUrl(url) ? "youtube" : "stream",
          webpage_url: url
        });

        log(`{green-fg}URL added to playlist!{/green-fg}`);
      } else {
        log(`{red-fg}Player cannot add tracks{/red-fg}`);
      }

      updatePlaylistUI();
    });

    promptBox.on("cancel", () => {
      finish();
    });
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
        try {
          importPath(args.join(" "));
        } finally {
          isLocked = false;
        }
        break;

      case "youtube":
        openYoutubePrompt();
        break;

      case "quit":
        if (typeof player.stop === "function") {
          player.stop();
        }
        if (ui.screen && typeof ui.screen.destroy === "function") {
          ui.screen.destroy();
        }
        process.exit(0);
        return;

      default:
        break;
    }

    updatePlaylistUI();
  }

  if (ui.screen) {
    ui.screen.removeAllListeners("keypress");
  }

  ui.getInput((ch, key) => {
    if (isLocked) return;

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
    } else if (ch === "y") {
      runCommand("youtube");
    } else if (name === "q" || (key && key.ctrl && name === "c")) {
      runCommand("quit");
    }
  });

  updatePlaylistUI();
}
