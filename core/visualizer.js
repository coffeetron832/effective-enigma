const WAVEFORM_SIZE = 25; 
const LEVELS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function createVisualizer({ ui, player }) {
  let interval = null;
  let spectrum = new Array(WAVEFORM_SIZE).fill(0);
  let waveFrame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * CORRECCIÓN DE BARRAS: Genera amplitudes dinámicas rítmicas distribuidas por frecuencias
   * (graves a la izquierda, medios al centro, agudos a la derecha) emulando un ecualizador real.
   */
  function calculateRealtimeSpectrum() {
    if (!player.isPlaying()) {
      spectrum.fill(0);
      return;
    }

    // Velocidad de oscilación de la onda gráfica
    waveFrame += 0.35; 

    for (let i = 0; i < WAVEFORM_SIZE; i++) {
      const timeFactor = waveFrame + (i * 0.4);
      
      // Simulación física de frecuencias
      const bass = Math.sin(timeFactor * 0.7) * (WAVEFORM_SIZE - i) * 1.6;
      const mids = Math.cos(timeFactor * 1.3) * (12 - Math.abs(12 - i)) * 2.0;
      const treble = Math.sin(timeFactor * 2.1) * i * 1.1;

      // Amplitud unificada con ganancia base
      let amplitude = Math.abs(bass + mids + treble) * 1.6;

      // Inyección de micro-picos rítmicos controlados aleatoriamente
      if (Math.random() > 0.75) {
        amplitude += Math.random() * 30;
      }

      const rawValue = clamp(Math.floor(amplitude), 5, 100);

      // Suavizado (Easing) para evitar saltos toscos y dar caída natural
      if (rawValue > spectrum[i]) {
        spectrum[i] = Math.floor(rawValue * 0.8 + spectrum[i] * 0.2);
      } else {
        spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.72));
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

    const lines = [];
    const maxValInSpectrum = 100;

    for (let h = height; h > 0; h--) {
      let line = "  ";
      spectrum.forEach(value => {
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

    const footerLine = " " + "░".repeat(WAVEFORM_SIZE * 2 + 1);
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

      // Actualizamos los datos físicos de las barras
      calculateRealtimeSpectrum();

      const asciiVisualizer = getVisualizerSpectrum(7);
      ui.setVisualizer(asciiVisualizer);

      const volume = typeof player.getVolume === "function" ? player.getVolume() : 80;
      const isLoop = typeof player.isLoop === "function" ? player.isLoop() : false;
      const isShuffle = typeof player.isShuffle === "function" ? player.isShuffle() : false;
      const eqMode = typeof player.getEQ === "function" ? player.getEQ() : "ROCK";

      ui.setVolumeState(volume, isLoop, isShuffle, eqMode);

      if (ui.render) ui.render();
    } catch (e) {
      // Protector de errores UI
    }
  }

  function start() {
    if (interval) clearInterval(interval);
    render();
    // Bucle estable a 30 FPS para evitar flicker en la TUI
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
    render
  };
}
