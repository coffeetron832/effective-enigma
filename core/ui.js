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
    padding: { top: 1, left: 2 }
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
        // CORRECCIÓN CRUCIAL: Si width es un string (ej: "70%"), calculamos el ancho basado en la pantalla real
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
        
        nowPlayingBox.setContent(
          `{bold}Track:{/bold} ${trackName}\n\n` +
          `Progress: [${progressBar}] ${safePercent}%\n` +
          `Time:     ${current} / ${total}`
        );
      } catch (e) {
        nowPlayingBox.setContent(`{bold}Track:{/bold} ${trackName}\n\nTime: ${current} / ${total}`);
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
        return idx === currentIndex ? `-> * ${track.name}` : `   ${track.name}`;
      }).slice(Math.max(0, currentIndex - 2), currentIndex + 3);

      playlistBox.setContent(items.join("\n"));
      screen.render();
    },

    setFileInfo: (codec, bitrate) => {
      playlistBox.setLabel(` [ PLAYLIST - ${codec} @ ${bitrate} ] `);
      screen.render();
    },

    appendLog: (msg) => {
      nowPlayingBox.setContent(msg);
      screen.render();
    },

    clearLog: () => {
      nowPlayingBox.setContent("");
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

