import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import sharp from "sharp";

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

  let audioWaveform = new Array(30).fill(0); 
  
  // Definimos la ruta para la tubería FIFO temporal
  const fifoPath = path.resolve("./music_wave_fifo");

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

  function setupFifo() {
    // Si la tubería FIFO ya existe, la borramos para evitar bloqueos de buffer residuales
    if (fs.existsSync(fifoPath)) {
      try { fs.unlinkSync(fifoPath); } catch {}
    }
    // Creamos una tubería con nombre nativa en Linux usando mkfifo
    try {
      execSync(`mkfifo "${fifoPath}"`);
    } catch (err) {
      ui.appendLog(`{red-fg}FIFO Error:{/red-fg} ${err.message}`);
    }
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
    audioWaveform.fill(0);
    if (ui.setWaveform) ui.setWaveform(audioWaveform);

    // Borramos el archivo FIFO temporal
    if (fs.existsSync(fifoPath)) {
      try { fs.unlinkSync(fifoPath); } catch {}
    }
  }

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
        const uiSize = ui.getSize ? ui.getSize() : { width: 80, height: 24 };
        const targetWidth = Math.max(Math.floor(uiSize.width * 0.28), 24);
        const targetHeight = Math.max(Math.floor(uiSize.height - 18), 10) * 2;

        const { data, info } = await sharp(picture.data)
          .resize(targetWidth, targetHeight, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

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
    setupFifo(); // Preparamos el puente FIFO

    try {
      playing = true;
      startedAt = Date.now();

      // Lanzamos mpv apuntando la salida de audio hacia el archivo FIFO en lugar de fd://3
      const currentProcess = spawn(
        "mpv",
        [
          "--no-video",
          "--no-terminal",
          "--keep-open=no",
          `--audio-to-file=${fifoPath}`,
          "--oformat=s16le",  
          "--oaudio-channels=mono",
          "--oaudio-speed=44100",
          track.path
        ],
        {
          detached: false,
          stdio: ["ignore", "ignore", "pipe"] 
        }
      );

      audioProcess = currentProcess;

      // Abrimos el flujo de lectura asíncrono sobre el archivo FIFO desde Node.js
      const audioStream = fs.createReadStream(fifoPath);

      audioStream.on("data", chunk => {
        if (!playing) return;
        
        try {
          const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
          if (samples.length === 0) return;

          const numBars = audioWaveform.length;
          const samplesPerBar = Math.floor(samples.length / numBars) || 1;

          for (let i = 0; i < numBars; i++) {
            let sumSquares = 0;
            const start = i * samplesPerBar;
            const end = Math.min(start + samplesPerBar, samples.length);

            for (let j = start; j < end; j++) {
              sumSquares += samples[j] * samples[j];
            }

            const rms = Math.sqrt(sumSquares / (end - start || 1));
            const normalizedHeight = Math.min(Math.floor((rms / 4000) * 8), 8);
            
            audioWaveform[i] = Math.max(normalizedHeight, audioWaveform[i] - 1);
          }

          if (typeof ui.setWaveform === "function") {
            ui.setWaveform(audioWaveform);
          }
        } catch (err) {}
      });

      currentProcess.stderr.on("data", data => {
        const text = String(data || "").trim();
        if (text.includes("error") || text.includes("fatal")) {
          ui.appendLog(`{red-fg}mpv error:{/red-fg} ${text.slice(0, 30)}`);
        }
      });

      currentProcess.on("exit", (code) => {
        const wasKilled = currentProcess.isKilledManually;

        if (currentProcess === audioProcess) {
          audioProcess = null;
        }

        if (playing && !wasKilled) {
          next();
        } else {
          ui.render();
        }
      });

      currentProcess.on("error", error => {
        playing = false;
        ui.appendLog(`{red-fg}Failed to launch mpv:{/red-fg} ${error.message}`);
      });

      ui.setFileInfo("MPEG Layer 3", "320kbps");
      ui.setPlaylist(playlist, index);
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
    if (playing) { stop(); } else { play(); }
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
  function getDuration() { return 180; }

  return {
    play, stop, toggle, next, prev, isPlaying, getTrack,
    getCurrentIndex, getTracks, getCurrentTime, getDuration,
    loadTracks, getVolume, isLoop, isShuffle, getEQ
  };
}
