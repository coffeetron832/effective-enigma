import { spawn } from "child_process";

const MAX_WAVEFORM_SIZE = 80; 
const LEVELS = [" ", "▅", "▆", "▇", "█"];
const TOP_MARK = "▀";

export function createVisualizer({ ui, player }) {
  let uiInterval = null;
  let spectrum = new Array(MAX_WAVEFORM_SIZE).fill(0);
  let peakHold = new Array(MAX_WAVEFORM_SIZE).fill(0);
  let trackAudioMap = [];
  let currentAnimationTick = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * EXTRACCIÓN ASÍNCRONA POR STREAMS (Sin lag):
   * Lee el archivo en segundo plano sin congelar el renderizado de la terminal.
   */
  function analyzeTrackAsync(trackPath) {
    trackAudioMap = [];
    
    // Usamos una lectura asíncrona de envolvente de volumen muy ligera
    const ffProcess = spawn("ffmpeg", [
      "-i", trackPath,
      "-ac", "1",
      "-filter:a", "aresample=100,afade=t=in:ss=0:d=0.1", // Muestreo ultra bajo para velocidad pura
      "-f", "u8", // Forzamos salida en bytes crudos de 8 bits
      "-"
    ], { stdio: ["ignore", "pipe", "ignore"] });

    ffProcess.stdout.on("data", chunk => {
      // Cada byte leído es directamente un pico de volumen en ese microsegundo
      for (let i = 0; i < chunk.length; i++) {
        // El formato u8 va de 0 a 255 (donde 128 es el centro/silencio)
        const amplitude = Math.abs(chunk[i] - 128);
        const intensity = clamp(Math.round((amplitude / 128) * 100), 5, 100);
        trackAudioMap.push(intensity);
      }
    });

    ffProcess.on("close", () => {
      // Si el mapa quedó vacío por error, creamos un respaldo armónico dinámico
      if (trackAudioMap.length === 0) {
        for (let i = 0; i < 5000; i++) {
          trackAudioMap.push(Math.floor(Math.sin(i * 0.05) * 30) + 40);
        }
      }
    });
  }

  /**
   * PROCESADOR ESPECTRAL RÍTMICO:
   * Acopla la intensidad real extraída con las frecuencias ordenadas del ecualizador.
   */
  function processAudioToBars(barsCount) {
    if (!player.isPlaying()) {
      spectrum.fill(0);
      return;
    }

    currentAnimationTick += 0.15;
    const currentMs = typeof player.getCurrentTimeMs === "function" ? player.getCurrentTimeMs() : 0;
    
    // Mapeamos el tiempo actual de reproducción al índice del mapa de bytes extraídos
    // Al remuestrear a 100Hz en ffmpeg, cada índice equivale aproximadamente a 10ms
    const mapIndex = Math.floor(currentMs / 10);
    const baseIntensity = trackAudioMap[clamp(mapIndex, 0, trackAudioMap.length - 1)] || 15;

    for (let i = 0; i < barsCount; i++) {
      const n = i / (barsCount - 1 || 1);

      // Zonas reales: Graves (izq), Medios (centro), Agudos (der)
      const bassZone = Math.exp(-Math.pow((n - 0.15) / 0.16, 2));
      const midsZone = Math.exp(-Math.pow((n - 0.50) / 0.22, 2));
      const trebleZone = Math.exp(-Math.pow((n - 0.85) / 0.16, 2));

      // Añadimos modulaciones rítmicas para expandir los picos de forma orgánica
      const waveFactor = Math.sin(currentAnimationTick + i * 0.25);
      let amplitude = baseIntensity;

      if (bassZone > 0.4) {
        amplitude *= (1.3 + waveFactor * 0.25) * bassZone;
      } else if (midsZone > 0.4) {
        amplitude *= (1.0 + Math.cos(currentAnimationTick * 1.2 + i) * 0.2) * midsZone;
      } else if (trebleZone > 0.4) {
        amplitude *= (0.7 + Math.sin(currentAnimationTick * 2.0 - i) * 0.35) * trebleZone;
      } else {
        amplitude *= 0.2;
      }

      const targetValue = clamp(Math.floor(amplitude), 3, 100);

      // Filtro de inercia balística (Caída suave y amortiguada)
      if (targetValue > spectrum[i]) {
        spectrum[i] = Math.floor(targetValue * 0.85 + spectrum[i] * 0.15);
      } else {
        spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.76));
      }

      // Caída lenta del pico flotante analógico
      if (spectrum[i] > peakHold[i]) {
        peakHold[i] = spectrum[i];
      } else {
        peakHold[i] = Math.max(0, peakHold[i] - 2.0);
      }
    }
  }

  function getVisualizerSpectrum(height = 7, barsCount) {
    if (!player.isPlaying()) {
      const paddingVal = Math.max(0, Math.floor((height - 1) / 2));
      const lines = new Array(paddingVal).fill("  ");
      const paddingSpaces = " ".repeat(Math.max(2, Math.floor((barsCount * 2 - 26) / 2)));
      lines.push(`${paddingSpaces}[ AUDIO PAUSED / STOPPED ]`);
      while (lines.length < height) lines.push("  ");
      lines.push(" " + "─".repeat(barsCount * 2 + 1));
      return lines.join("\n");
    }

    const lines = [];
    const maxVal = 100;

    for (let h = height; h > 0; h--) {
      let line = "  ";
      for (let i = 0; i < barsCount; i++) {
        const val = spectrum[i] || 0;
        const peak = peakHold[i] || 0;

        const normalizedVal = Math.round((val / maxVal) * height);
        const normalizedPeak = Math.round((peak / maxVal) * height);

        if (normalizedVal >= h) {
          const charIndex = clamp(Math.floor((h / height) * (LEVELS.length - 1)), 1, LEVELS.length - 1);
          line += LEVELS[charIndex] + " ";
        } else if (normalizedPeak === h && h > 1) {
          line += TOP_MARK + " ";
        } else {
          line += "  "; 
        }
      }
      lines.push(line);
    }

    const footerLine = " " + "─".repeat(barsCount * 2 + 1);
    lines.push(footerLine);

    return lines.join("\n");
  }

  function render() {
    try {
      const track = player.getTrack();
      const current = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
      const duration = typeof player.getDuration === "function" ? player.getDuration() : 180;
      
      const trackName = track ? `${track.artist || "Local Track"} - ${track.name}` : "No Track";
      const percentage = duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : 0;
      
      ui.setNowPlaying(trackName, current, duration, percentage);

      const uiSize = ui.getSize ? ui.getSize() : { width: 80 };
      const calculatedWidth = Math.min(MAX_WAVEFORM_SIZE, Math.max(20, Math.floor((uiSize.width || 80) * 0.62)));

      if (spectrum.length !== calculatedWidth) {
        spectrum = new Array(calculatedWidth).fill(0);
        peakHold = new Array(calculatedWidth).fill(0);
      }

      processAudioToBars(calculatedWidth);

      const asciiVisualizer = getVisualizerSpectrum(7, calculatedWidth);
      ui.setVisualizer(asciiVisualizer);

      const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
      const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
      const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
      const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

      ui.setVolumeState(volume, isLoop, isShuffle, eqMode);

      if (ui.render) ui.render();
    } catch (e) {}
  }

  function start() {
    if (uiInterval) clearInterval(uiInterval);
    render();
    uiInterval = setInterval(() => { render(); }, 33); // 30 FPS fluidos
  }

  function stop() {
    if (uiInterval) {
      clearInterval(uiInterval);
      uiInterval = null;
    }
    spectrum.fill(0);
    peakHold.fill(0);
    trackAudioMap = [];
  }

  return { 
    start, 
    stop, 
    render,
    analyzeTrackAsync
  };
}
