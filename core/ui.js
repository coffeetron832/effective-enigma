import blessed from "blessed";

export function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "MASCII Player 2026",
    dockBorders: true
  });

  const albumBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "30%",
    height: "70%",
    label: " [ ALBUM ART ] ",
    border: { type: "line" },
    style: { border: { fg: "cyan" } },
    align: "center",
    valign: "middle",
    tags: true // CORRECCIÓN CLAVE: Permite procesar estilos de texto en las carátulas
  });

  const nowPlayingBox = blessed.box({
    parent: screen,
    top: 0,
    left: "30%",
    width: "70%",
    height: "70%", 
    label: " [ NOW PLAYING ] ",
    border: { type: "line" },
    style: { border: { fg: "green" } },
    padding: { top: 1, left: 2, right: 2 },
    scrollable: true,
    alwaysScroll: true,
    tags: true // CORRECCIÓN CLAVE: Permite procesar los textos con {bold} de reproducción
  });

  const playlistBox = blessed.box({
    parent: screen,
    top: "70%",
    left: 0,
    width: "60%",
    height: "30%",
    label: " [ TRACKLIST ] ",
    border: { type: "line" },
    style: { border: { fg: "yellow" } },
    tags: true // CORRECCIÓN CLAVE: Permite pintar de colores el track interactivo
  });

  const statusBox = blessed.box({
    parent: screen,
    top: "70%",
    left: "60%",
    width: "40%",
    height: "30%",
    label: " [ AUDIO CONFIG ] ",
    border: { type: "line" },
    style: { border: { fg: "white" } },
    padding: { top: 1, left: 2 },
    tags: true // CORRECCIÓN CLAVE: Permite estructurar la configuración de ecualizadores y volumen
  });

  function formatSeconds(sec = 0) {
    if (!isFinite(sec) || sec < 0) return "00:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  let globalKeypressListener = null;

  return {
    screen: screen,

    getSize: () => ({
      width: screen.width,
      height: screen.height
    }),

    setNowPlaying: (trackName, current, total, percent) => {
      try {
        const computedWidth = typeof nowPlayingBox.width === "number" 
          ? nowPlayingBox.width 
          : Math.floor(screen.width * 0.7);

        const barWidth = Math.max(10, computedWidth - 25);
        
        let safePercent = parseInt(percent);
        if (isNaN(safePercent) || safePercent < 0) safePercent = 0;
        if (safePercent > 100) safePercent = 100;

        const barLength = Math.floor(barWidth * (safePercent / 100)) || 0;
        const safeBarLength = Math.max(0, Math.min(barWidth, barLength));
        const remainingLength = Math.max(0, barWidth - safeBarLength);

        const progressBar = "█".repeat(safeBarLength) + "░".repeat(remainingLength);
        
        const currentTimeStr = formatSeconds(current);
        const totalTimeStr = formatSeconds(total);

        const maxTextLength = Math.max(20, computedWidth - 12);
        let displayTrackName = trackName;
        if (displayTrackName.length > maxTextLength) {
          displayTrackName = displayTrackName.slice(0, maxTextLength - 3) + "...";
        }

        nowPlayingBox.setContent(
          `\n` +
          ` {bold}Track:{/}     ${displayTrackName}\n\n` +
          ` {bold}Progress:{/}  [${progressBar}] ${safePercent}%\n\n` +
          ` {bold}Time:{/}      ${currentTimeStr} / ${totalTimeStr}`
        );
      } catch (e) {
        nowPlayingBox.setContent(`{bold}Track:{/} ${trackName}\nTime: ${current} / ${total}`);
      }
    },

    setVisualizer: () => {},
    clearVisual: () => {},
    setWaveform: () => {},

    setAlbumArt: (asciiArt, album, year) => {
      albumBox.setContent(`${asciiArt}\n\n{yellow-fg}${album}{/}\n(${year})`);
    },

    setVolumeState: (volume, loop, shuffle, eqMode) => {
      statusBox.setContent(
        `• {bold}Volume:{/}    [${volume}%]\n` +
        `• {bold}Loop:{/}      [${loop ? "ENABLED" : "DISABLED"}]\n` +
        `• {bold}Shuffle:{/}   [${shuffle ? "ON" : "OFF"}]\n` +
        `• {bold}Equalizer:{/} {green-fg}${eqMode}{/}`
      );
    },

    setPlaylist: (playlist, currentIndex) => {
      const items = playlist.map((track, idx) => {
        // Marcamos la canción que está sonando con un color amarillo brillante de Blessed
        return idx === currentIndex 
          ? `{yellow-fg}-> * ${track.name}{/}` 
          : `     ${track.name}`;
      }).slice(Math.max(0, currentIndex - 2), currentIndex + 3);

      playlistBox.setContent(items.join("\n"));
    },

    setFileInfo: (codec, bitrate) => {
      playlistBox.setLabel(` [ PLAYLIST - ${codec} @ ${bitrate} ] `);
    },

    appendLog: (msg) => {
      // Limpia etiquetas anidadas para evitar bugs de strings rotos en los bordes
      const clearMsg = msg.replace(/\{.*?\}/g, "");
      nowPlayingBox.setLabel(` [ LOG: ${clearMsg} ] `);
    },

    clearLog: () => {
      nowPlayingBox.setLabel(" [ NOW PLAYING ] ");
    },

    getInput: (callback) => {
      if (globalKeypressListener) {
        screen.removeListener("keypress", globalKeypressListener);
      }
      
      globalKeypressListener = (ch, key) => {
        callback(ch, key);
      };

      screen.on("keypress", globalKeypressListener);

      return {
        removeAllListeners: () => {
          if (globalKeypressListener) {
            screen.removeListener("keypress", globalKeypressListener);
            globalKeypressListener = null;
          }
        },
        setValue: () => {},
        focusInput: () => {}
      };
    },

    focusInput: () => {},
    destroy: () => { screen.destroy(); },
    render: () => { screen.render(); }
  };
}
