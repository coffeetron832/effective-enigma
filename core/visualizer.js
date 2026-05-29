import fs from "fs";
import { spawn } from "child_process";

const LEVELS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const WAVEFORM_SIZE = 25; 

export function createVisualizer({ ui, player }) {
  let interval = null;
  let cavaProcess = null;
  let spectrum = new Array(WAVEFORM_SIZE).fill(0);
  const CAVA_CONFIG_PATH = "/tmp/mascii-visualizer-cava.conf";
  let fallbackFrame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createCavaConfig() {
    const content = `
[general]
bars = ${WAVEFORM_SIZE}
framerate = 60
autosens = 1
sensitivity = 100

[smoothing]
integral = 7
gravity = 20
ignore = 0

[input]
method = pulse
source = auto

[output]
method = raw
raw_target = /dev/stdout
data_format = binary
bar_delimiter = 0
`;
    fs.writeFileSync(CAVA_CONFIG_PATH, content);
    return CAVA_CONFIG_PATH;
  }

  function startCava() {
    stopCava();
    const config = createCavaConfig();

    cavaProcess = spawn("cava", ["-p", config], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { 
        ...process.env,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.uid || 1000}`
      }
    });

    cavaProcess.on("error", (err) => {
      if (ui && ui.appendLog) {
        ui.appendLog(`{yellow-fg}Visualizer status:{/yellow-fg} Engine initialized in fallback mode.`);
      }
    });

    let buffer = Buffer.alloc(0);

    cavaProcess.stdout.on("data", chunk => {
      if (!player.isPlaying()) {
        buffer = Buffer.alloc(0);
        return;
      }

      buffer = Buffer.concat([buffer, chunk]);

      if (buffer.length > WAVEFORM_SIZE * 8) {
        buffer = buffer.subarray(buffer.length - (WAVEFORM_SIZE * 2));
      }

      while (buffer.length >= WAVEFORM_SIZE) {
        const frame = buffer.subarray(0, WAVEFORM_SIZE);
        buffer = buffer.subarray(WAVEFORM_SIZE);

        for (let i = 0; i < WAVEFORM_SIZE; i++) {
          const rawValue = Math.floor((frame[i] / 255) * 100);
          if (rawValue > spectrum[i]) {
            spectrum[i] = rawValue;
          } else {
            spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.75));
          }
        }
      }
    });

    cavaProcess.stderr.on("data", () => {});
  }

  function stopCava() {
    if (cavaProcess) {
      try { 
        cavaProcess.kill("SIGKILL"); 
      } catch {}
      cavaProcess = null;
    }
    try {
      if (fs.existsSync(CAVA_CONFIG_PATH)) fs.unlinkSync(CAVA_CONFIG_PATH);
    } catch {}
    spectrum.fill(0);
  }

  function getVisualizerSpectrum(height = 6) {
    if (!player.isPlaying()) {
      return "\n".repeat(Math.floor(height / 2)) + "         [ AUDIO PAUSED / STOPPED ]";
    }

    const isSpectrumEmpty = spectrum.length === 0 || spectrum.every(v => v === 0);
    let targetSpectrum = [...spectrum];

    if (isSpectrumEmpty) {
      fallbackFrame++;
      targetSpectrum = Array.from({ length: WAVEFORM_SIZE }, (_, i) => {
        const waveA = Math.sin((fallbackFrame * 0.3) + i * 0.4);
        const waveB = Math.cos((fallbackFrame * 0.15) - i * 0.2);
        return Math.floor(35 + 30 * ((waveA + waveB) / 2));
      });
    }

    const lines = [];
    const maxValInSpectrum = 100;

    for (let h = height; h > 0; h--) {
      let line = "  ";
      targetSpectrum.forEach(value => {
        const normalizedValue = Math.round((value / maxValInSpectrum) * height);
        if (normalizedValue >= h) {
          const blockIndex = clamp(Math.floor((value / maxValInSpectrum) * 8), 1, 8);
          line += LEVELS[blockIndex] + " ";
        } else {
          line += "  "; 
        }
      });
      lines.push(line);
    }

    const footerLine = " " + "░".repeat(targetSpectrum.length * 2 + 1);
    lines.push(footerLine);

    return lines.join("\n");
  }

  function render() {
    try {
      const track = player.getTrack();
      const current = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
      const duration = typeof player.getDuration === "function" ? player.getDuration() : 180;
      
      let percentage = duration > 0 ? Math.round((current / duration) * 100) : 0;
      if (isNaN(percentage) || percentage < 0) percentage = 0;
      if (percentage > 100) percentage = 100;

      const trackName = track ? `${track.artist || "Local Track"} - ${track.name}` : "No Track";
      
      // CORRECCIÓN: Quitamos el formateo de strings redundante (currentTimeStr, totalTimeStr)
      // Pasamos las variables numéricas directas para que calce con la firma de ui.js
      ui.setNowPlaying(trackName, current, duration, percentage);

      const asciiVisualizer = getVisualizerSpectrum(7);
      ui.setVisualizer(asciiVisualizer);

      const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
      const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
      const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
      const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

      ui.setVolumeState(volume, isLoop, isShuffle, eqMode);
    } catch (e) {
      // Protector de bucle de renderizado
    }
  }

  function start() {
    startCava();
    render();
    if (interval) clearInterval(interval);
    interval = setInterval(() => { render(); }, 50);
  }

  function stop() {
    stopCava();
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return { start, stop, render };
}
