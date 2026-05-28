import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata"; // Extractor de metadatos
import sharp from "sharp"; // Procesador de imágenes nativo eficiente

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
        audioProcess.isKilledManually = true; 
        audioProcess.kill("SIGTERM");
      } catch {}
      audioProcess = null;
    }
    playing = false;
    startedAt = 0;
  }

  // Generador de portadas de alta definición TrueColor (RGB de 24 bits)
  async function updateAlbumArtMetadata(track, ui) {
    const defaultArt = [
      "      .:::::.",
      "    .:::::::::.",
      "   :::::::::::::",
      "   ░░░░░░░░░░░░░",
      " ─────────────────",
      "  ───────────────",
      "   ─────────────"
    ].join("\n");

    let albumName = "Retro Terminal Hits";
    let year = "2026";

    try {
      const metadata = await mm.parseFile(track.path);
      
      if (metadata.common.album) albumName = metadata.common.album;
      if (metadata.common.year) year = String(metadata.common.year);
      if (metadata.common.artist) track.artist = metadata.common.artist;

      const picture = metadata.common.picture && metadata.common.picture[0];

      if (picture && picture.data) {
        // Obtenemos las dimensiones de la caja visual del layout
        const uiSize = ui.getSize ? ui.getSize() : { width: 80, height: 24 };
        
        // Ajuste de escala para que conserve proporción cuadrada en celdas de terminal
        const targetWidth = Math.max(Math.floor(uiSize.width * 0.28), 24);
        // Multiplicamos por 2 ya que cada fila de caracteres pintará 2 píxeles verticales
        const targetHeight = Math.max(Math.floor(uiSize.height - 18), 10) * 2;

        // Extraemos el buffer en canales RGBA puros sin compresión intermediaria
        const { data, info } = await sharp(picture.data)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        let asciiResult = "";
        const width = info.width;
        const height = info.height;

        // Agrupamos filas de dos en dos saltando de manera vertical
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x++) {
            // Píxel de la mitad superior de la celda
            const idxTop = (y * width + x) * 4;
            const rTop = data[idxTop];
            const gTop = data[idxTop + 1];
            const bTop = data[idxTop + 2];

            // Píxel de la mitad inferior de la celda
            const hasBottom = (y + 1) < height;
            const idxBot = hasBottom ? ((y + 1) * width + x) * 4 : idxTop;
            const rBot = data[idxBot];
            const gBot = data[idxBot + 1];
            const bBot = data[idxBot + 2];

            // Secuencia ANSI TrueColor escape:
            // \x1b[38;2;R;G;Bm -> Color del texto (Frente: medio bloque inferior '▄')
            // \x1b[48;2;R;G;Bm -> Color del fondo (Detrás: rellena la mitad superior)
            asciiResult += `\x1b[38;2;${rBot};${gBot};${bBot};48;2;${rTop};${gTop};${bTop}m▄\x1b[0m`;
          }
          asciiResult += "\n";
        }

        ui.setAlbumArt(asciiResult, albumName, year);
      } else {
        ui.setAlbumArt(defaultArt, albumName, year);
      }
    } catch {
      ui.setAlbumArt(defaultArt, albumName, year);
    }
  }

  function play() {
    const track = getTrack();

    if (!track) {
      ui.appendLog("{red-fg}No music found.{/red-fg} Add files to ./music");
      return;
    }

    cleanup();

    try {
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
        if (currentProcess === audioProcess) {
          audioProcess = null;
        }

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
      ui.setPlaylist(playlist, index);

      // Renderización asíncrona de la carátula RGB a color real
      updateAlbumArtMetadata(track, ui);

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
