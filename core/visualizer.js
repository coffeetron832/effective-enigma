import fs from "fs";
import { spawn } from "child_process";

// Bloques ASCII verticales para construir las barras del ecualizador de abajo hacia arriba
const LEVELS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function createVisualizer({ ui, player }) {
  let interval = null;
  let cavaProcess = null;
  let spectrum = [];
  const FIFO_PATH = "/tmp/cava.fifo";

  // Contador de ciclos para generar la onda matemática de fallback si CAVA no responde
  let fallbackFrame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function startCava() {
    try {
      if (fs.existsSync(FIFO_PATH)) {
        fs.unlinkSync(FIFO_PATH);
      }
    } catch {}

    // CAVA debe estar configurado para salida cruda (raw) con valores separados por ';'
    cavaProcess = spawn("cava");

    setTimeout(() => {
      try {
        if (!fs.existsSync(FIFO_PATH)) return;
        
        const stream = fs.createReadStream(FIFO_PATH);
        stream.on("data", buffer => {
          const text = String(buffer).trim();
          if (!text) return;

          // CAVA entrega valores iterativos separados por punto y coma (ej: 0;23;45;12;...)
          spectrum = text
            .split(";")
            .map(n => parseInt(n, 10))
            .filter(n => !isNaN(n));
        });
      } catch {}
    }, 500);
  }

  function stopCava() {
    if (cavaProcess) {
      try {
        cavaProcess.kill();
      } catch {}
      cavaProcess = null;
    }
    try {
      if (fs.existsSync(FIFO_PATH)) fs.unlinkSync(FIFO_PATH);
    } catch {}
  }

  // Genera un espectro en rejilla vertical (varias líneas de alto) como en la imagen
  function getVisualizerSpectrum(height = 6) {
    if (!player.isPlaying()) {
      return "\n".repeat(Math.floor(height / 2)) + "         [ AUDIO PAUSED / STOPPED ]";
    }

    // Identificar si el buffer de CAVA está vacío o en ceros absolutos
    const isSpectrumEmpty = spectrum.length === 0 || spectrum.every(v => v === 0);
    let targetSpectrum = [...spectrum];

    if (isSpectrumEmpty) {
      // --- ANIMACIÓN FALLBACK ---
      // Generamos 25 frecuencias simuladas usando una combinación de ondas senoidales desplazadas
      fallbackFrame++;
      targetSpectrum = Array.from({ length: 25 }, (_, i) => {
        const waveA = Math.sin((fallbackFrame * 0.4) + i * 0.5);
        const waveB = Math.cos((fallbackFrame * 0.2) - i * 0.3);
        return Math.floor(50 + 49 * ((waveA + waveB) / 2)); // Normalizado a un rango aproximado de 0-100
      });
    }

    const lines = [];
    // Ajustamos la escala asumiendo un rango máximo de entrada de 100 (estándar raw de CAVA)
    const maxValInSpectrum = isSpectrumEmpty ? 100 : Math.max(...targetSpectrum, 1);

    // Renderizamos la matriz de texto de arriba hacia abajo
    for (let h = height; h > 0; h--) {
      let line = "  ";
      targetSpectrum.forEach(value => {
        // Mapeamos el valor actual proporcionalmente a la altura de la caja de visualización
        const normalizedValue = Math.round((value / maxValInSpectrum) * height);
        
        if (normalizedValue >= h) {
          // Calculamos el índice del caracter de bloque (0 a 8) según el nivel de llenado
          const blockIndex = clamp(Math.floor((value / maxValInSpectrum) * 8), 1, 8);
          line += LEVELS[blockIndex] + " ";
        } else {
          line += "  "; // Espacio vacío si la frecuencia no alcanza esta altura
        }
      });
      lines.push(line);
    }

    // Añadimos una base decorativa al final del espectro
    const footerLine = " " + "░".repeat(targetSpectrum.length * 2 + 1);
    lines.push(footerLine);

    return lines.join("\n");
  }

  function formatTime(sec = 0) {
    if (!isFinite(sec) || sec < 0) return "00:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function render() {
    const track = player.getTrack();
    const current = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
    const duration = typeof player.getDuration === "function" ? player.getDuration() : 0;
    
    const currentTimeStr = formatTime(current);
    const totalTimeStr = formatTime(duration);
    
    // 1. Calcular porcentaje de progreso
    const percentage = duration > 0 ? Math.round((current / duration) * 100) : 0;

    // 2. Actualizar el panel superior de reproducción (Now Playing)
    const trackName = track ? `${track.artist || "Unknown"} - ${track.name}` : "No Track";
    ui.setNowPlaying(trackName, currentTimeStr, totalTimeStr, percentage);

    // 3. Actualizar el Espectro ASCII central (Caja de altura 7 para encajar en el layout)
    const asciiVisualizer = getVisualizerSpectrum(7);
    ui.setVisualizer(asciiVisualizer);

    // 4. Actualizar el panel de estado inferior (Volumen, Loop, etc.)
    const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
    const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
    const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
    const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

    ui.setVolumeState(volume, isLoop, isShuffle, eqMode);
  }

  function start() {
    startCava();
    render();

    // 100ms mantiene estables unos ~10 FPS, ideal para animaciones de terminal fluidas sin parpadeos
    interval = setInterval(() => {
      render();
    }, 100);
  }

  function stop() {
    stopCava();
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return {
    start,
    stop,
    render
  };
}
