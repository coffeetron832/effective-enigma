import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export function createPlayer({ playlist: initialPlaylist = [], ui }) {
  let playlist = [...initialPlaylist];
  let index = 0;
  let audioProcess = null;
  let playing = false;
  let startedAt = 0;

  let currentVolume = 80;
  let loopState = false;
  let shuffleState = false;
  let eqMode = "ROCK";

  loadTracks();

  function loadTracks() {
    const musicDir = path.resolve("./music");
    if (!fs.existsSync(musicDir)) {
      try {
        fs.mkdirSync(musicDir, { recursive: true });
      } catch {}
      return;
    }

    try {
      const files = fs.readdirSync(musicDir);
      const supported = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]);
      
      const localTracks = files
        .filter(file => supported.has(path.extname(file).toLowerCase()))
        .map(file => ({
          name: path.basename(file, path.extname(file)),
          path: path.join(musicDir, file),
          duration: "03:00",
          artist: "Local Track"
        }));

      if (localTracks.length > 0) {
        playlist = localTracks;
      }
    } catch {}
  }

  function getTrack() {
    if (!playlist.length) return null;
    return playlist[index];
  }

  function cleanup() {
    if (audioProcess) {
      try {
        // SOLUCIÓN: Le marcamos directamente al objeto del proceso que fue cancelado a mano
        audioProcess.isKilledManually = true; 
        audioProcess.kill("SIGTERM");
      } catch {}
      audioProcess = null;
    }
    playing = false;
    startedAt = 0;
  }

  function play() {
    const track = getTrack();

    if (!track) {
      ui.appendLog("{red-fg}No music found.{/red-fg} Add files to ./music");
      return;
    }

    cleanup();

    try {
      // Guardamos la referencia local del proceso que vamos a lanzar ahora
      const currentProcess = spawn(
        "mpv",
        [
          "--no-video",
          "--no-terminal",
          "--audio-display=no",
          "--keep-open=no",
          track.path
        ],
        {
          detached: false,
          stdio: ["ignore", "ignore", "pipe"]
        }
      );

      audioProcess = currentProcess;

      currentProcess.stderr.on("data", data => {
        const text = String(data || "").trim();
        if (!text) return;

        if (text.includes("error") || text.includes("fatal")) {
          ui.appendLog(`{red-fg}mpv error:{/red-fg} ${text.slice(0, 30)}`);
        }
      });

      currentProcess.on("exit", () => {
        // Si el proceso que acaba de morir es el actual y NO fue matado a mano
        if (currentProcess === audioProcess) {
          audioProcess = null;
        }

        // CORRECCIÓN: Comprobamos la propiedad interna de ESTE proceso específico.
        // Si tiene 'isKilledManually', ignoramos su cierre por completo.
        if (playing && !currentProcess.isKilledManually) {
          next();
        } else {
          ui.render();
        }
      });

      currentProcess.on("error", error => {
        if (currentProcess === audioProcess) {
          playing = false;
        }
        ui.appendLog(`{red-fg}Failed:{/red-fg} ${error.message}`);
      });

      playing = true;
      startedAt = Date.now();

      ui.setFileInfo("MPEG Layer 3", "320kbps");
      
      const sampleArt = [
        "      .:::::.",
        "    .:::::::::.",
        "   :::::::::::::",
        "   ░░░░░░░░░░░░░",
        " ─────────────────",
        "  ───────────────",
        "   ─────────────"
      ].join("\n");
      
      ui.setAlbumArt(sampleArt, "Retro Terminal Hits", "2026");
      ui.setPlaylist(playlist, index);

    } catch (error) {
      playing = false;
      ui.appendLog(`{red-fg}Playback failed{/red-fg}`);
    }
  }

  function stop() {
    cleanup();
    ui.clearVisual(); 
    ui.setPlaylist(playlist, index); 
  }

  function toggle() {
    if (playing) {
      stop();
    } else {
      play();
    }
  }

  function next() {
    if (!playlist.length) return;
    stop();
    index++;
    if (index >= playlist.length) index = 0;
    play();
  }

  function prev() {
    if (!playlist.length) return;
    stop();
    index--;
    if (index < 0) index = playlist.length - 1;
    play();
  }

  function isPlaying() {
    return playing;
  }

  function getCurrentIndex() {
    return index;
  }

  function getTracks() {
    return playlist;
  }

  function getCurrentTime() {
    if (!playing || !startedAt) return 0;
    return Math.floor((Date.now() - startedAt) / 1000);
  }

  function getDuration() {
    return 180; 
  }

  function getVolume() { return currentVolume; }
  function isLoop() { return loopState; }
  function isShuffle() { return shuffleState; }
  function getEQ() { return eqMode; }

  return {
    play,
    stop,
    toggle,
    next,
    prev,
    isPlaying,
    getTrack,
    getCurrentIndex,
    getTracks,
    getCurrentTime,
    getDuration,
    loadTracks,
    getVolume,
    isLoop,
    isShuffle,
    getEQ
  };
}
