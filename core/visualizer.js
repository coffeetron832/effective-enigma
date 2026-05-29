const MAX_WAVEFORM_SIZE = 80; 
const LEVELS = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function createVisualizer({ ui, player }) {
  let interval = null;
  let spectrum = new Array(MAX_WAVEFORM_SIZE).fill(0);
  let audioTickActive = false;
  let waveFrame = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function injectAudioTick() {
    audioTickActive = true;
  }

  /**
   * PROCESAMIENTO ORDENADO POR FRECUENCIAS (Estilo CAVA):
   * Divide el espectro horizontal en Graves (izq), Medios (centro) y Agudos (der).
   */
  function processAudioToBars(barsCount) {
    if (!player.isPlaying()) {
      spectrum.fill(0);
      return;
    }

    if (audioTickActive) {
      waveFrame += 0.4;
      audioTickActive = false; 
    } else {
      waveFrame += 0.02; // Caída/movimiento sutil en pausas leves
    }

    const track = player.getTrack();
    let seed = 1;
    if (track && track.name) {
      for (let s = 0; s < track.name.length; s++) seed += track.name.charCodeAt(s);
    }

    for (let i = 0; i < barsCount; i++) {
      // Normalizamos la posición de la barra entre 0 y 1 para mapear las zonas
      const n = i / (barsCount - 1 || 1);

      // 1. FILTROS DE DISTRIBUCIÓN (Campanas de Gauss para ordenar frecuencias)
      const bassZone = Math.exp(-Math.pow((n - 0.15) / 0.18, 2));   // Pico en el 15% (Izquierda)
      const midsZone = Math.exp(-Math.pow((n - 0.50) / 0.22, 2));   // Pico en el 50% (Centro)
      const trebleZone = Math.exp(-Math.pow((n - 0.85) / 0.18, 2)); // Pico en el 85% (Derecha)

      // 2. GENERACIÓN DE ONDAS ESPECÍFICAS POR CANAL
      // Graves: Oscilaciones pesadas y lentas
      const bass = (Math.sin(waveFrame * 1.2 + seed * 0.1) * 35 + 45) * bassZone;
      
      // Medios: Dinámica constante y rítmica
      const mids = (Math.cos(waveFrame * 2.1 + i * 0.1 + seed * 0.2) * 30 + 40) * midsZone;
      
      // Agudos: Oscilaciones rápidas, cortas y nerviosas
      const treble = (Math.sin(waveFrame * 3.8 - i * 0.3 + seed * 0.3) * 25 + 30) * trebleZone;

      // 3. COMBINACIÓN FILTRADA
      let amplitude = bass + mids + treble;

      // Inyección de picos rítmicos controlados (golpes de batería simulados en graves/medios)
      if (Math.sin(waveFrame * 1.5 + seed) > 0.75 && (i % 4 === 0)) {
        amplitude += (bassZone * 25) + (midsZone * 15);
      }

      const targetValue = clamp(Math.floor(amplitude), 3, 100);

      // 4. FILTRO DE INERCIA Y CAÍDA BALÍSTICA (Suavizado de barras)
      if (targetValue > spectrum[i]) {
        // Subida rápida
        spectrum[i] = Math.floor(targetValue * 0.82 + spectrum[i] * 0.18);
      } else {
        // Caída lenta y elegante para que no parpadee tosco
        spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.78));
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
      lines.push(" " + "░".repeat(barsCount * 2 + 1));
      return lines.join("\n");
    }

    const lines = [];
    const maxValInSpectrum = 100;

    for (let h = height; h > 0; h--) {
      let line = "  ";
      for (let i = 0; i < barsCount; i++) {
        const value = spectrum[i] || 0;
        const normalizedValue = Math.round((value / maxValInSpectrum) * height);
        
        if (normalizedValue >= h) {
          const blockIndex = clamp(Math.floor((value / maxValInSpectrum) * 8), 1, 8);
          line += LEVELS[blockIndex] + " ";
        } else {
          line += "  "; 
        }
      }
      lines.push(line);
    }

    const footerLine = " " + "░".repeat(barsCount * 2 + 1);
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
    if (interval) clearInterval(interval);
    audioTickActive = false;
    render();
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
    injectAudioTick
  };
}
