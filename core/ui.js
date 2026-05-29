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
    valign: "middle"
  });

  const nowPlayingBox = blessed.box({
    parent: screen,
    top: 0,
    left: "30%",
    width: "70%",
    height: "30%",
    label: " [ NOW PLAYING ] ",
    border: { type: "line" },
    style: { border: { fg: "green" } },
    padding: { top: 0, left: 2, right: 2 }, // Reducido el padding superior
    scrollable: true,                      // Permite scroll interno si la terminal es diminuta
    alwaysScroll: true
  });

  const visualizerBox = blessed.box({
    parent: screen,
    top: "30%",
    left: "30%",
    width: "70%",
    height: "40%",
    label: " [ REALTIME SPECTRUM ] ",
    border: { type: "line" },
    style: { border: { fg: "magenta" } },
    padding: { left: 2 }
  });

  const playlistBox = blessed.box({
    parent: screen,
    top: "70%",
    left: 0,
    width: "60%",
    height: "30%",
    label: " [ TRACKLIST ] ",
    border: { type: "line" },
    style: { border: { fg: "yellow" } }
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
    padding: { top: 1, left: 2 }
  });

  function formatSeconds(sec = 0) {
    if (!isFinite(sec) || sec < 0) return "00:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  screen.key(["C-c"], () => {
    return process.exit(0);
  });

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

        // Dejamos un margen seguro a la derecha para la barra
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

        // CORRECCIÓN: Si el nombre del track excede el espacio visual seguro, lo truncamos con '...'
        const maxTextLength = Math.max(20, computedWidth - 12);
        let displayTrackName = trackName;
        if (displayTrackName.length > maxTextLength) {
          displayTrackName = displayTrackName.slice(0, maxTextLength - 3) + "...";
        }

        // CORRECCIÓN DE DISEÑO: Compactado estricto a un solo salto de línea simple (\n)
        // Esto garantiza que entre en cualquier resolución vertical de terminal.
        nowPlayingBox.setContent(
          `{bold}Track:{/bold} ${displayTrackName}\n` +
          `Progress: [${progressBar}] ${safePercent}%\n` +
          `Time:     ${currentTimeStr} / ${totalTimeStr}`
        );
      } catch (e) {
        nowPlayingBox.setContent(`{bold}Track:{/bold} ${trackName}\nTime: ${current} / ${total}`);
      }
      screen.render();
    },

    setVisualizer: (asciiSpectrum) => {
      visualizerBox.setContent(asciiSpectrum);
      screen.render();
    },

    setAlbumArt: (asciiArt, album, year) => {
      albumBox.setContent(`${asciiArt}\n\n{yellow-fg}${album}{/}\n(${year})`);
      screen.render();
    },

    setVolumeState: (volume, loop, shuffle, eqMode) => {
      statusBox.setContent(
        `• {bold}Volume:{/bold}   [${volume}%]\n` +
        `• {bold}Loop:{/bold}     [${loop ? "ENABLED" : "DISABLED"}]\n` +
        `• {bold}Shuffle:{/bold}  [${shuffle ? "ON" : "OFF"}]\n` +
        `• {bold}Equalizer:{/bold} {green-fg}${eqMode}{/}`
      );
      screen.render();
    },

    setPlaylist: (playlist, currentIndex) => {
      const items = playlist.map((track, idx) => {
        return idx === currentIndex ? `-> * ${track.name}` : `    ${track.name}`;
      }).slice(Math.max(0, currentIndex - 2), currentIndex + 3);

      playlistBox.setContent(items.join("\n"));
      screen.render();
    },

    setFileInfo: (codec, bitrate) => {
      playlistBox.setLabel(` [ PLAYLIST - ${codec} @ ${bitrate} ] `);
      screen.render();
    },

    appendLog: (msg) => {
      nowPlayingBox.setLabel(` [ LOG: ${msg.replace(/\{.*?\}/g, "")} ] `);
      screen.render();
    },

    clearLog: () => {
      nowPlayingBox.setLabel(" [ NOW PLAYING ] ");
      screen.render();
    },

    clearVisual: () => {
      visualizerBox.setContent("\n\n         [ AUDIO PAUSED / STOPPED ]");
      screen.render();
    },

    setWaveform: () => {},

    getInput: (callback) => {
      screen.on("keypress", (ch, key) => {
        callback(ch, key);
      });
      return {
        removeAllListeners: () => {},
        setValue: () => {},
        focusInput: () => {}
      };
    },

    focusInput: () => {},
    destroy: () => { screen.destroy(); },
    render: () => { screen.render(); }
  };
}
