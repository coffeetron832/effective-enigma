import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import sharp from "sharp";

export function createPlayer({ playlist: initialPlaylist = [], ui, visualizer = null }) {
  let playlist = [...initialPlaylist];
  let index = 0;
  let audioProcess = null;
  let playing = false;
  let startedAt = 0;
  let isManualKill = false; 
  let currentTrackId = 0; 

  let currentVolume = 80;
  let loopState = false;
  let shuffleState = false;
  let eqMode = "ROCK";

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
    if (audioProcess) {
      try {
        audioProcess.removeAllListeners("exit");
        audioProcess.kill("SIGKILL"); 
      } catch {}
      audioProcess = null;
    }
    try {
      if (fs.existsSync("/tmp/mascii-mpv.sock")) {
        fs.unlinkSync("/tmp/mascii-mpv.sock");
      }
    } catch {}
    playing = false;
    startedAt = 0;
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
        const targetWidth = Math.max(Math.floor(uiSize.width * 0.28), 24);
        const targetHeight = Math.max(Math.floor(uiSize.height - 18), 10) * 2;

        const { data, info } = await sharp(picture.data)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        if (myTrackId !== currentTrackId) return;

        let asciiResult = "";
        const width = info.width;
        const height = info.height;

        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x++) {
            const idxTop = (y * width + x) * 4;
            const rTop = data[idxTop]; const gTop = data[idxTop + 1]; const bTop = data[idxTop + 2];

            const hasBottom = (y + 1) < height;
            const idxBot = hasBottom ? ((y + 1) * width + x) * 4 : idxTop;
            const rBot = data[idxBot]; const gBot = data[idxBot + 1]; const bBot = data[idxBot + 2];

            asciiResult += `\x1b[38;2;${rBot};${gBot};${bBot};48;2;${rTop};${gTop};${bTop}m▄\x1b[0m`;
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
      startedAt = Date.now();

      // CORRECCIÓN: Levantamos mpv de forma normal (tiempo real) agregando un nodo IPC
      // e inyectando un filtro de observación nativo ('computed') para el espectro.
      audioProcess = spawn(
        "mpv",
        [
          "--no-video",
          "--no-terminal",
          "--really-quiet",
          "--keep-open=no",
          `--volume=${currentVolume}`,
          "--ao=pulse,alsa",
          // Filtro nativo que calcula la amplitud de la onda en tiempo real sin desviar el flujo de salida
          "--af=lavfi=[asplit[out1][out2],[out2]asubboost,atintegral,asplit[vis][out3],[vis]volume=0[muted]]",
          "--input-ipc-server=/tmp/mascii-mpv.sock",
          track.path
        ],
        {
          detached: false,
          stdio: ["ignore", "ignore", "ignore"] // Ignoramos pipes directos para evitar cierres prematuros
        }
      );

      audioProcess.on("exit", (code) => {
        if (playing && !isManualKill) {
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

  function stop() {
    isManualKill = true; 
    cleanup();
    ui.clearVisual(); 
    ui.setPlaylist(playlist, index); 
    if (ui.render) ui.render();
  }

  function toggle() {
    if (playing) { stop(); } else { play(); }
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

  function isPlaying() { return playing; }
  function getCurrentIndex() { return index; }
  function getTracks() { return playlist; }
  function getVolume() { return currentVolume; }
  function isLoop() { return loopState; }
  function isShuffle() { return shuffleState; }
  function getEQ() { return eqMode; }
  
  function getCurrentTime() {
    if (!playing || !startedAt) return 0;
    return Math.floor((Date.now() - startedAt) / 1000);
  }
  
  function getDuration() {
    const track = getTrack();
    return track && track.duration ? track.duration : 180;
  }

  function setVisualizer(visInstance) {
    visualizer = visInstance;
  }

  return {
    play, stop, toggle, next, prev, isPlaying, getTrack,
    getCurrentIndex, getTracks, getCurrentTime, getDuration,
    loadTracks, getVolume, isLoop, isShuffle, getEQ, setVisualizer
  };
}
