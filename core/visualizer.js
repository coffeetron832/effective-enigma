const MAX_WAVEFORM_SIZE = 80; 

// Bloques de densidad progresiva para el renderizado geométrico limpio
const LEVELS = [" ", "▅", "▆", "▇", "█"];
const TOP_MARK = "▀"; 

export function createVisualizer({ ui, player }) {
  let uiInterval = null;
  let animationFrame = 0;
  
  let spectrum = new Array(MAX_WAVEFORM_SIZE).fill(0);
  let peakHold = new Array(MAX_WAVEFORM_SIZE).fill(0);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * ANIMACIÓN GEOMÉTRICA PURA (Ligera y Fluida):
   * Calcula alturas combinando funciones trigonométricas armónicas por zonas.
   */
  function generateProceduralWaves(barsCount) {
    if (!player.isPlaying()) {
      spectrum.fill(0);
      return;
    }

    // Avanzamos la velocidad de las barras
    animationFrame += 0.12;

    for (let i = 0; i < barsCount; i++) {
      // Posición normalizada de la barra en la caja (0 a 1)
      const position = i / (barsCount - 1 || 1);

      // Delimitación armónica: emulamos Graves (izq), Medios (centro) y Agudos (der)
      const bassZone = Math.exp(-Math.pow((position - 0.15) / 0.18, 2));
      const midsZone = Math.exp(-Math.pow((position - 0.50) / 0.25, 2));
      const trebleZone = Math.exp(-Math.pow((position - 0.85) / 0.18, 2));

      // Ondas procedimentales desfasadas matemáticamente
      const f1 = Math.sin(animationFrame * 1.5 + i * 0.2) * 35 + 45;
      const f2 = Math.cos(animationFrame * 2.2 - i * 0.4) * 30 + 40;
      const f3 = Math.sin(animationFrame * 3.5 + i * 0.6) * 20 + 30;

      let amplitude = (f1 * bassZone) + (f2 * midsZone) + (f3 * trebleZone);

      // Añadimos picos intermitentes aleatorios en el canal de graves para dar dinamismo
      if (i % 6 === 0) {
        amplitude += Math.sin(animationFrame * 0.8) * 15 * bassZone;
      }

      const targetValue = clamp(Math.floor(amplitude), 4, 95);

      // Suavizado balístico tradicional para evitar movimientos toscos o parpadeos
      if (targetValue > spectrum[i]) {
        spectrum[i] = Math.floor(targetValue * 0.75 + spectrum[i] * 0.25);
      } else {
        spectrum[i] = Math.max(0, Math.floor(spectrum[i] * 0.80));
      }

      // Sistema de caída analógica del punto de pico superior (Peak Hold)
      if (spectrum[i] > peakHold[i]) {
        peakHold[i] = spectrum[i];
      } else {
        peakHold[i] = Math.max(0, peakHold[i] - 1.6);
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

    // Dibujamos la cuadrícula de arriba hacia abajo
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

      // Corremos las ondas matemáticas limpias
      generateProceduralWaves(calculatedWidth);

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
    uiInterval = setInterval(() => { render(); }, 33); // 30 FPS fijos y eficientes
  }

  function stop() {
    if (uiInterval) {
      clearInterval(uiInterval);
      uiInterval = null;
    }
    spectrum.fill(0);
    peakHold.fill(0);
  }

  return { 
    start, 
    stop, 
    render
  };
}
