const BAR_CHARS = " .:-=+*#";

export function createVisualizer({ ui, player }) {

  let interval = null;
  let lastFrame = "";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getVisualizerWidth() {

    const terminalWidth = process.stdout.columns || 80;

    return clamp(
      terminalWidth - 30,
      18,
      28
    );
  }

  function generateBars(width, animated = true) {

    if (!animated) {
      return " ".repeat(width);
    }

    let line = "";

    for (let i = 0; i < width; i++) {

      const level = Math.floor(
        Math.random() * BAR_CHARS.length
      );

      line += BAR_CHARS[level];
    }

    return line;
  }

  function createProgressBar(current, total, width = 16) {

    if (!total || total <= 0) {
      return `[${"-".repeat(width)}]`;
    }

    const progress = clamp(
      current / total,
      0,
      1
    );

    const filled = Math.round(progress * width);

    return `[${"=".repeat(filled)}${"-".repeat(width - filled)}]`;
  }

  function formatTime(sec = 0) {

    if (!isFinite(sec)) {
      return "00:00";
    }

    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function trimTrackName(name = "", max = 18) {

    if (!name) {
      return "No Track";
    }

    if (name.length <= max) {
      return name;
    }

    return `${name.slice(0, max - 3)}...`;
  }

  function divider(width = 28) {
    return "-".repeat(width);
  }

  function render() {

    const input = ui.getInput();

    // Evita render mientras el usuario escribe
    if (
      ui.screen.focused === input &&
      input.value &&
      input.value.length > 0
    ) {
      return;
    }

    const width = getVisualizerWidth();

    const track = player.getTrack();

    const current =
      typeof player.getCurrentTime === "function"
        ? player.getCurrentTime()
        : 0;

    const duration =
      typeof player.getDuration === "function"
        ? player.getDuration()
        : 0;

    const playing = player.isPlaying();

    const progressBar = createProgressBar(
      current,
      duration,
      16
    );

    const state = playing
      ? "{green-fg}PLAYING{/green-fg}"
      : "{red-fg}STOPPED{/red-fg}";

    const trackName = trimTrackName(
      track?.name || "No Track",
      18
    );

    // Logo simplificado para reducir carga del terminal
    const logo = `
{green-fg}MASCII{/green-fg}
ASCII TERMINAL MUSIC PLAYER
`.trim();

    // Visualizer MUCHO más liviano
    const visualizer = playing
      ? generateBars(width, true)
      : "[ stopped ]";

    const content = `${logo}
${divider()}
Track: ${trackName}
State: ${state}
Time:  ${formatTime(current)} / ${formatTime(duration)}
${divider()}
${visualizer}
${divider()}
${progressBar}
${divider()}
[space] play/pause
[n] next
[p] prev
[q] quit`;

    // Evita renders idénticos
    if (content === lastFrame) {
      return;
    }

    lastFrame = content;

    ui.set(content);
  }

  function start() {

    render();

    // MUCHÍSIMO menos render agresivo
    interval = setInterval(() => {
      render();
    }, 700);
  }

  function stop() {

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