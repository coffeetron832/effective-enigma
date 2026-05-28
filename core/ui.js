import blessed from "blessed";

export function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "ULTRA ASCII AUDIO PLAYER",
    fullUnicode: true,
    dockBorders: true,
    style: {
      bg: "black",
      fg: "green", // Color de texto predeterminado verde retro
    },
  });

  screen.key(["C-c"], () => process.exit(0));

  let playlistContent = "";
  let albumArtContent = "";
  let inputFocused = false;

  // ==========================================
  // -- Definición de las cajas del layout ---
  // ==========================================

  const headerBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: "ULTRA ASCII AUDIO PLAYER",
    align: "center",
    style: {
      fg: "green",
    },
  });

  const nowPlayingBox = blessed.box({
    top: 1,
    left: 0,
    width: "100%",
    height: 2,
    content: "NOW PLAYING: [ ] 00:00 / 00:00 (0%)\nTRACK: [N/A]",
    style: {
      fg: "green",
    },
  });

  // Caja del espectro (central superior)
  const visualizerBox = blessed.box({
    top: 3,
    left: 0,
    width: "100%",
    height: 10,
    content: "Visualizador de espectro ASCII (se actualizará dinámicamente)",
    style: {
      fg: "green",
    },
  });

  const playlistBox = blessed.box({
    top: 13,
    left: 0,
    width: "50%",
    height: "100%-16",
    content: playlistContent,
    border: {
      type: "line",
    },
    label: " PLAYLIST: ",
    scrollable: true,
    keys: true,
    mouse: true,
    style: {
      fg: "green",
      border: {
        fg: "green",
      },
      selected: {
        bg: "white",
        fg: "black",
      },
    },
  });

  const fileInfoBox = blessed.box({
    top: 13,
    left: "50%",
    width: "50%",
    height: 3,
    content: "MPEG Layer 3, 320kbps",
    border: {
      type: "line"
    },
    label: " FILE INFO: ",
    style: {
      fg: "green",
      border: {
        fg: "green"
      }
    },
  });

  const albumArtBox = blessed.box({
    top: 16,
    left: "50%",
    width: "50%",
    height: "100%-19",
    content: albumArtContent,
    border: {
      type: "line"
    },
    label: " ALBUM ART: ",
    style: {
      fg: "green",
      border: {
        fg: "green"
      }
    },
  });

  const volumeBox = blessed.box({
    top: "100%-4",
    left: 0,
    width: "100%",
    height: 1,
    content: "VOL: 100% [==========] | LOOP: OFF | RAND: ON | EQ: FLAT",
    style: {
      fg: "green",
    },
  });

  const input = blessed.textbox({
    top: "100%-3",
    left: 0,
    width: "100%",
    height: 3,
    label: " (H for Help, Q to Quit, N Next, P Prev, S Stop, L Loop, R Shuffle) ",
    border: {
      type: "line",
    },
    inputOnFocus: true,
    keys: true,
    mouse: true,
    padding: {
      left: 1,
    },
    style: {
      fg: "green",
      border: {
        fg: "green",
      },
      focus: {
        border: {
          fg: "green",
        },
      },
    },
  });

  // ==========================================
  // -- Añadir elementos a la pantalla --------
  // ==========================================

  screen.append(headerBox);
  screen.append(nowPlayingBox);
  screen.append(visualizerBox);
  screen.append(playlistBox);
  screen.append(fileInfoBox);
  screen.append(albumArtBox);
  screen.append(volumeBox);
  screen.append(input);

  // ==========================================
  // -- Funciones de ayuda y utilidades -------
  // ==========================================

  function stripMarkup(text = "") {
    return String(text)
      .replace(/\{\/?[^}]+\}/g, "")
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  }

  // ==========================================
  // -- Métodos expuestos de actualización ----
  // ==========================================

  function setNowPlaying(trackName, currentTime, totalTime, percentage) {
    nowPlayingBox.setContent(
      `NOW PLAYING: [>] ${currentTime} / ${totalTime} (${percentage}%)\nTRACK: [${trackName}]`
    );
    screen.render();
  }

  function setPlaylist(trackList, selectedIndex) {
    playlistContent = trackList
      .map((track, index) => {
        const prefix = index === selectedIndex ? `> ` : `  `;
        return `${prefix}${index + 1}. [${track.played ? "X" : " "}] ${track.name} ${
          track.duration
        }`;
      })
      .join("\n");
    playlistBox.setContent(playlistContent);
    if (typeof playlistBox.select === "function") {
      playlistBox.select(selectedIndex);
    }
    screen.render();
  }

  function setFileInfo(codec, bitRate) {
    fileInfoBox.setContent(`${codec}, ${bitRate}`);
    screen.render();
  }

  // Permite actualizar dinámicamente el arte en ASCII y la etiqueta del recuadro
  function setAlbumArt(asciiArt, albumName, year) {
    albumArtBox.setContent(asciiArt);
    albumArtBox.setLabel(` ALBUM ART: [${albumName} - ${year}] `);
    screen.render();
  }

  function setVisualizer(asciiSpectrogram) {
    visualizerBox.setContent(asciiSpectrogram);
    screen.render();
  }

  function setVolumeState(volume, loop, rand, eq) {
    const volBar = "=".repeat(Math.floor(volume / 10)) + "-".repeat(10 - Math.floor(volume / 10));
    volumeBox.setContent(
      `VOL: ${volume}% [${volBar}] | LOOP: ${loop ? "ON" : "OFF"} | RAND: ${
        rand ? "ON" : "OFF"
      } | EQ: ${eq}`
    );
    screen.render();
  }

  // Soporte de compatibilidad: por si el visualizador antiguo inyecta bloques directos
  function append(content = "") {
    if (!content) return;
    visualizerBox.setContent(content);
    screen.render();
  }

  function set(content = "") {
    if (content) {
      visualizerBox.setContent(content);
    }
    screen.render();
  }

  function appendLog(message = "") {
    if (message) {
      fileInfoBox.setContent(String(message));
    }
    screen.render();
  }

  function clearLog() {
    fileInfoBox.setContent("");
    screen.render();
  }

  function clearVisual() {
    visualizerBox.setContent("");
    screen.render();
  }

  // Limpieza profunda del búfer interno del textbox al ganar foco
  function focusInput() {
    inputFocused = true;
    input.setValue("");
    input.value = "";

    if (screen.focused !== input) {
      input.focus();
    }
    screen.render();
  }

  function getInput() {
    return input;
  }

  function getSize() {
    return {
      width: screen.width,
      height: screen.height,
    };
  }

  function destroy() {
    screen.destroy();
  }

  // ==========================================
  // -- Eventos de Escucha --------------------
  // ==========================================

  screen.on("resize", () => {
    screen.render();
  });

  input.on("focus", () => {
    inputFocused = true;
  });

  input.on("blur", () => {
    inputFocused = false;
    screen.render();
  });

  return {
    screen,
    playlistBox, 
    visualBox: visualizerBox, // Alias para evitar caídas si se busca por el nombre viejo
    input,
    set,
    append,
    setNowPlaying,
    setPlaylist,
    setFileInfo,
    setAlbumArt,
    setVisualizer,
    setVolumeState,
    appendLog,
    clearLog,
    clearVisual,
    render: () => {
      screen.render();
    },
    focusInput,
    getInput,
    getSize,
    destroy,
  };
}
