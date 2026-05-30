import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";
import * as mm from "music-metadata";
import sharp from "sharp";

export function createPlayer({ playlist: initialPlaylist = [], ui }) {
  let playlist = [...initialPlaylist];
  let index = 0;
  let audioProcess = null;
  let ipcClient = null; 
  
  let playing = false;
  let isPaused = false;
  
  let startedAt = 0;
  let totalElapsedTime = 0; 
  let lastResumeAt = 0;

  let isManualKill = false; 
  let currentTrackId = 0; 

  let currentVolume = 80;
  let loopState = false;
  let shuffleState = false;
  let eqMode = "ROCK";

  const IPC_PATH = `/tmp/mascii-mpv-${Date.now()}.sock`;

  loadTracks();

  function loadTracks() {
    const musicDir = path.resolve("./music");
    if (!fs.existsSync(musicDir)) {
      try { fs.mkdirSync(musicDir, { recursive: true }); } catch {}
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
          duration: 180, 
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
    if (ipcClient) {
      try { ipcClient.destroy(); } catch {}
      ipcClient = null;
    }
    if (audioProcess) {
      try {
        audioProcess.removeAllListeners("exit");
        audioProcess.kill("SIGKILL"); 
      } catch {}
      audioProcess = null;
    }
    try {
      if (fs.existsSync(IPC_PATH)) {
        fs.unlinkSync(IPC_PATH);
      }
    } catch {}

    playing = false;
    isPaused = false;
    startedAt = 0;
    totalElapsedTime = 0;
    lastResumeAt = 0;
  }

  function sendIpcCommand(commandArray) {
    if (ipcClient && !ipcClient.destroyed) {
      const request = JSON.stringify({ command: commandArray }) + "\n";
      ipcClient.write(request);
    }
  }

  async function updateAlbumArtMetadata(track, ui, myTrackId) {
    const defaultArt = [
      "      .:::::.",
      "    .:::::::::.",
      "    :::::::::::::",
      "    ░░░░░░░░░░░░░",
      " ─────────────────",
      "  ───────────────",
      "    ─────────────"
    ].join("\n");

    let albumName = "Retro Terminal Hits";
    let year = "2026";

    try {
      const metadata = await mm.parseFile(track.path);
      
      if (myTrackId !== currentTrackId) return;

      if (metadata.common.album) albumName = metadata.common.album;
      if (metadata.common.year) year = String(metadata.common.year);
      if (metadata.common.artist) track.artist = metadata.common.artist;

      if (metadata.format.duration) {
        track.duration = Math.max(1, Math.round(metadata.format.duration));
      }

      ui.setFileInfo(metadata.container || "MPEG Layer 3", `${Math.round((metadata.format.bitrate || 320000) / 1000)}kbps`);

      const picture = metadata.common.picture && metadata.common.picture[0];

      if (picture && picture.data) {
        const uiSize = ui.getSize ? ui.getSize() : { width: 80, height: 24 };
        
        // Multiplicamos el muestreo por pixel. Como cada celda contiene 2x4 subpuntos de Braille, 
        // duplicamos la densidad horizontal y cuadruplicamos la vertical para un detalle brutal.
        const cols = Math.max(Math.floor(uiSize.width * 0.24), 22);
        const rows = Math.max(Math.floor(uiSize.height - 18), 11);
        
        const targetWidth = cols * 2;
        const targetHeight = rows * 4;

        const { data, info } = await sharp(picture.data)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .removeAlpha() 
          .raw()
          .toBuffer({ resolveWithObject: true });

        if (myTrackId !== currentTrackId) return;

        let asciiResult = "";
        const width = info.width;
        const height = info.height;

        // Mapeo binario de puntos Braille Unicode (Matriz 2x4 por celda)
        const dotValues = [
          [0x01, 0x08],
          [0x02, 0x10],
          [0x04, 0x20],
          [0x40, 0x80]
        ];

        for (let y = 0; y < height; y += 4) {
          for (let x = 0; x < width; x += 2) {
            let brailleCode = 0;
            let rSum = 0, gSum = 0, bSum = 0, count = 0;

            // Analizamos el bloque interno de 2x4 subpíxeles
            for (let dy = 0; dy < 4; dy++) {
              for (let dx = 0; dx < 2; dx++) {
                const py = y + dy;
                const px = x + dx;

                if (py < height && px < width) {
                  const idx = (py * width + px) * 3;
                  const r = data[idx];
                  const g = data[idx + 1];
                  const b = data[idx + 2];

                  // Promedio de color del subbloque
                  rSum += r; gSum += g; bSum += b;
                  count++;

                  // Si supera el umbral medio de brillo, activamos el punto de relieve Braille
                  const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                  if (brightness > 45) { 
                    brailleCode |= dotValues[dy][dx];
                  }
                }
              }
            }

            const rAvg = count > 0 ? Math.round(rSum / count) : 0;
            const gAvg = count > 0 ? Math.round(gSum / count) : 0;
            const bAvg = count > 0 ? Math.round(bSum / count) : 0;

            // Generamos el carácter Unicode final sumando el offset base de Braille (0x2800)
            const finalChar = String.fromCharCode(0x2800 + brailleCode);

            // Inyectamos el carácter de alta densidad con su color TrueColor respectivo
            asciiResult += `\x1b[38;2;${rAvg};${gAvg};${bAvg}m${finalChar}\x1b[0m`;
          }
          asciiResult += "\n";
        }
        ui.setAlbumArt(asciiResult, albumName, year);
      } else {
        ui.setAlbumArt(defaultArt, albumName, year);
      }
    } catch {
      if (myTrackId === currentTrackId) {
        ui.setAlbumArt(defaultArt, albumName, year);
      }
    }
    if (myTrackId === currentTrackId && ui.render) ui.render();
  }

  function play() {
    const track = getTrack();
    if (!track) {
      ui.appendLog("{red-fg}No music found.{/red-fg} Add files to ./music");
      return;
    }

    cleanup();
    isManualKill = false; 
    currentTrackId++; 
    const myTrackId = currentTrackId;

    try {
      playing = true;
      isPaused = false;
      startedAt = Date.now();
      lastResumeAt = Date.now();
      totalElapsedTime = 0;

      audioProcess = spawn(
        "mpv",
        [
          "--no-video",
          "--no-terminal",
          "--really-quiet",
          "--keep-open=no",
          `--input-ipc-server=${IPC_PATH}`, 
          `--volume=${currentVolume}`,
          "--ao=pulse,alsa",
          track.path
        ],
        {
          detached: false,
          stdio: "ignore"
        }
      );

      setTimeout(() => {
        if (!playing || myTrackId !== currentTrackId) return;
        ipcClient = net.connect({ path: IPC_PATH });
        ipcClient.on("error", () => {});
      }, 200);

      audioProcess.on("exit", (code) => {
        if (playing && !isManualKill && code === 0) {
          next();
        } else {
          if (ui.render) ui.render();
        }
      });

      audioProcess.on("error", error => {
        playing = false;
        ui.appendLog(`{red-fg}Failed to launch mpv:{/red-fg} ${error.message}`);
      });

      ui.setFileInfo("MPEG Layer 3", "320kbps");
      ui.setPlaylist(playlist, index);
      updateAlbumArtMetadata(track, ui, myTrackId);

    } catch (error) {
      playing = false;
      ui.appendLog(`{red-fg}Playback failed{/red-fg}`);
    }
  }

  function toggle() {
    if (!playing) {
      play();
      return;
    }

    if (!isPaused) {
      totalElapsedTime += Date.now() - lastResumeAt;
      isPaused = true;
      sendIpcCommand(["set_property", "pause", true]); 
      ui.appendLog("{yellow-fg}Playback Paused{/yellow-fg}");
    } else {
      lastResumeAt = Date.now();
      isPaused = false;
      sendIpcCommand(["set_property", "pause", false]);
      ui.clearLog();
    }
  }

  function stop() {
    isManualKill = true; 
    cleanup();
    ui.clearVisual(); 
    ui.setPlaylist(playlist, index); 
    if (ui.render) ui.render();
  }

  function next() {
    if (!playlist.length) return;
    isManualKill = true;
    stop();
    index++;
    if (index >= playlist.length) index = 0;
    play();
  }

  function prev() {
    if (!playlist.length) return;
    isManualKill = true;
    stop();
    index--;
    if (index < 0) index = playlist.length - 1;
    play();
  }

  function isPlaying() { return playing && !isPaused; }
  function getCurrentIndex() { return index; }
  function getTracks() { return playlist; }
  function getVolume() { return currentVolume; }
  function isLoop() { return loopState; }
  function isShuffle() { return shuffleState; }
  function getEQ() { return eqMode; }
  
  function getCurrentTime() {
    if (!playing) return 0;
    if (isPaused) return Math.floor(totalElapsedTime / 1000);
    
    const currentSegment = Date.now() - lastResumeAt;
    return Math.floor((totalElapsedTime + currentSegment) / 1000);
  }
  
  function getDuration() {
    const track = getTrack();
    return track && track.duration ? track.duration : 180;
  }

  return {
    play, stop, toggle, next, prev, isPlaying, getTrack,
    getCurrentIndex, getTracks, getCurrentTime, getDuration,
    loadTracks, getVolume, isLoop, isShuffle, getEQ
  };
}
