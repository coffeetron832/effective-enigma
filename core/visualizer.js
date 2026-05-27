import fs from "fs";
import { spawn } from "child_process";

const LEVELS = [
  " ",
  "▁",
  "▂",
  "▃",
  "▄",
  "▅",
  "▆",
  "▇",
  "█"
];

export function createVisualizer({ ui, player }) {

  let interval = null;

  let cavaProcess = null;

  let spectrum = [];

  let lastFrame = "";

  const FIFO_PATH = "/tmp/cava.fifo";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function startCava() {

    try {
      fs.unlinkSync(FIFO_PATH);
    } catch {}

    cavaProcess = spawn("cava");

    setTimeout(() => {

      try {

        const stream = fs.createReadStream(FIFO_PATH);

        stream.on("data", buffer => {

          const text = String(buffer)
            .trim();

          if (!text) {
            return;
          }

          spectrum = text
            .split(";")
            .map(n => parseInt(n, 10))
            .filter(n => !isNaN(n));

        });

      } catch {}
    }, 500);
  }

  function stopCava() {

    if (cavaProcess) {

      try {
        cavaProcess.kill();
      } catch {}

      cavaProcess = null;
    }
  }

  function createBars() {

    if (!player.isPlaying()) {
      return "[ stopped ]";
    }

    if (!spectrum.length) {
      return "▁▁▁▁▁▁▁▁▁▁";
    }

    return spectrum
      .map(value => {

        const level = clamp(
          value,
          0,
          8
        );

        return LEVELS[level];

      })
      .join("");
  }

  function createProgressBar(current, total, width = 18) {

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

  function trimTrackName(name = "", max = 22) {

    if (!name) {
      return "No Track";
    }

    if (name.length <= max) {
      return name;
    }

    return `${name.slice(0, max - 3)}...`;
  }

  function divider(width = 32) {
    return "─".repeat(width);
  }

  function render() {

    const track = player.getTrack();

    const current =
      player.getCurrentTime?.() || 0;

    const duration =
      player.getDuration?.() || 0;

    const playing =
      player.isPlaying();

    const state = playing
      ? "{green-fg}PLAYING{/green-fg}"
      : "{red-fg}STOPPED{/red-fg}";

    const progressBar =
      createProgressBar(
        current,
        duration
      );

    const visualizer =
      createBars();

    const logo = `
{green-fg}MASCII{/green-fg}
REALTIME ASCII SPECTRUM
`.trim();

    const content = `
${logo}
${divider()}
Track:
${trimTrackName(track?.name || "No Track")}

State:
${state}

Time:
${formatTime(current)} / ${formatTime(duration)}

${divider()}
${visualizer}
${divider()}
${progressBar}
${divider()}

[space] play/pause
[n] next
[p] prev
[q] quit
`.trim();

    if (content === lastFrame) {
      return;
    }

    lastFrame = content;

    ui.set(content);
  }

  function start() {

    startCava();

    render();

    interval = setInterval(() => {
      render();
    }, 100);
  }

  function stop() {

    stopCava();

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
