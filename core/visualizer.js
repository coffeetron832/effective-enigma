const WAVEFORM_SIZE = 25; 
const LEVELS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function createVisualizer({ ui, player }) {
  let interval = null;
  let spectrum = new Array(WAVEFORM_SIZE).fill(0);
  let fallbackFrame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Procesa los chunks de audio PCM crudo inyectados desde el reproductor
   * @param {Buffer} chunk - Datos binarios de audio en 8-bit PCM
   */
  function handleAudioStream(chunk) {
    if (!player.isPlaying() || !chunk || chunk.length === 0) return;

    // Dividimos el chunk en bloques según el tamaño del espectro visual
    const blockSize = Math.floor(chunk.length / WAVEFORM_SIZE);
    if (blockSize < 1) return;

    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      let sum = 0;
      const start = i * blockSize;
      
      // Calculamos la amplitud absoluta (volumen físico) del bloque de audio
      for (let j = 0; j < blockSize; j++) {
        // Al ser PCM de 8 bits sin signo, el centro de la onda es 128
        const sample = chunk[start + j];
        sum += Math.abs(sample - 128);
      }

      const average = sum / blockSize;
      // Normalizamos el promedio de amplitud a un porcentaje (0 - 100)
      const rawValue = clamp(Math.floor((average / 64) * 100), 0, 100);

      // Aplicamos inercia física (easing) para un movimiento fluido de las barras
      if (rawValue > spectrum[i]) {
        spectrum[i] = rawValue;
      } else {
        spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.70));
      }
    }
  }

  function getVisualizerSpectrum(height = 6) {
    if (!player.isPlaying()) {
      const paddingVal = Math.max(0, Math.floor((height - 1) / 2));
      const lines = new Array(paddingVal).fill("  ");
      lines.push("         [ AUDIO PAUSED / STOPPED ]");
      while (lines.length < height) lines.push("  ");
      lines.push(" " + "░".repeat(WAVEFORM_SIZE * 2 + 1));
      return lines.join("\n");
    }

    // Si no hay datos de audio PCM activos, activamos el fallback matemático elegante
    const isSpectrumEmpty = spectrum.every(v => v === 0);
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
      percentage = clamp(percentage, 0, 100);

      const trackName = track ? `${track.artist || "Local Track"} - ${track.name}` : "No Track";
      
      ui.setNowPlaying(trackName, current, duration, percentage);

      const asciiVisualizer = getVisualizerSpectrum(7);
      ui.setVisualizer(asciiVisualizer);

      const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
      const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
      const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
      const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

      ui.setVolumeState(volume, isLoop, isShuffle, eqMode);

      if (ui.render) ui.render();
    } catch (e) {
      // Protector gráfico
    }
  }

  function start() {
    render();
    if (interval) clearInterval(interval);
    // Bucle estable a 30 FPS para sincronización TUI sin parpadeos
    interval = setInterval(() => { render(); }, 33);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    spectrum.fill(0);
  }

  return { 
    start, 
    stop, 
    render,
    handleAudioStream // Inyectamos este hook para capturar el pipe de datos de mpv
  };
}
