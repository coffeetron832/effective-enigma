import blessed from "blessed";

export function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "MASCII",
    fullUnicode: true,
    dockBorders: true
  });

  screen.key(["C-c"], () => process.exit(0));

  let baseContent = "";
  let statusContent = "";
  let inputFocused = false;

  const visualBox = blessed.box({
    top: 0,
    left: "center",
    width: 42,
    height: "100%-3",
    border: {
      type: "line"
    },
    padding: {
      left: 1,
      right: 1
    },
    tags: true,
    scrollable: false,
    style: {
      fg: "white",
      border: {
        fg: "green"
      }
    }
  });

  const input = blessed.textbox({
    bottom: 0,
    left: "center",
    width: 42,
    height: 3,
    border: {
      type: "line"
    },
    inputOnFocus: true,
    keys: true,
    mouse: true,
    padding: {
      left: 1
    },
    style: {
      fg: "white",
      border: {
        fg: "cyan"
      },
      focus: {
        border: {
          fg: "green"
        }
      }
    }
  });

  screen.append(visualBox);
  screen.append(input);

  function stripMarkup(text = "") {
    return String(text)
      .replace(/\{\/?[^}]+\}/g, "")
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  }

  function resizeUI(content = "") {
    const lines = String(content).split("\n");
    const cleanLines = lines.map(line => stripMarkup(line));

    const longestLine = Math.max(
      36,
      ...cleanLines.map(line => line.length)
    );

    const maxWidth = Math.max(42, (process.stdout.columns || 80) - 4);
    const width = Math.min(longestLine + 4, maxWidth);

    visualBox.width = width;
    input.width = width;

    visualBox.left = "center";
    input.left = "center";
  }

  function renderContent() {
    const parts = [];

    if (baseContent) {
      parts.push(baseContent);
    }

    if (statusContent) {
      parts.push(statusContent);
    }

    visualBox.setContent(parts.join("\n\n"));
  }

  // CORREGIDO: Eliminadas las restricciones de !inputFocused. La pantalla debe actualizarse siempre.
  function set(content = "") {
    baseContent = content;
    resizeUI(content);
    renderContent();
    screen.render();
  }

  function appendLog(message = "") {
    statusContent = message ? String(message) : "";
    renderContent();
    screen.render();
  }

  function clearLog() {
    statusContent = "";
    renderContent();
    screen.render();
  }

  // CORREGIDO: Eliminada restricción de renderizado
  function clearVisual() {
    baseContent = "";
    renderContent();
    screen.render();
  }

  // CORREGIDO: Limpieza profunda del búfer interno del textbox al ganar foco
  function focusInput() {
    inputFocused = true;
    
    // Forzamos el vaciado del valor y del string crudo para matar el "eco"
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
      height: screen.height
    };
  }

  function destroy() {
    screen.destroy();
  }

  screen.on("resize", () => {
    resizeUI(baseContent);
    renderContent();
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
    visualBox,
    input,
    set,
    appendLog,
    clearLog,
    clearVisual,
    // CORREGIDO: El método expuesto ahora renderiza libremente sin importar el foco
    render: () => {
      renderContent();
      screen.render();
    },
    focusInput,
    getInput,
    getSize,
    destroy
  };
}
