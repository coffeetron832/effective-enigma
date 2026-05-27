import { spawn } from "child_process";

export function createPlayer({
  playlist = [],
  ui
}) {

  let index = 0;

  let audioProcess = null;

  let playing = false;

  let startedAt = 0;

  function getTrack() {

    if (!playlist.length) {
      return null;
    }

    return playlist[index];
  }

  function cleanup() {

    if (audioProcess) {

      try {
        audioProcess.kill("SIGTERM");
      } catch {}

      audioProcess = null;
    }

    playing = false;

    startedAt = 0;
  }

  function play() {

    const track = getTrack();

    if (!track) {

      ui.appendLog(`
{red-fg}No music found{/red-fg}

Add files into:
{green-fg}./music{/green-fg}
      `);

      return;
    }

    cleanup();

    try {

      audioProcess = spawn(
        "mpv",
        [
          "--no-video",
          "--no-terminal",
          "--audio-display=no",
          "--keep-open=no",
          track.path
        ],
        {
          detached: false,
          stdio: [
            "ignore",
            "ignore",
            "pipe"
          ]
        }
      );

      audioProcess.stderr.on("data", data => {

        const text = String(data || "").trim();

        if (!text) {
          return;
        }

        if (
          text.includes("error") ||
          text.includes("fatal")
        ) {
          ui.appendLog(`
{red-fg}mpv:{/red-fg}

${text}
          `);
        }
      });

      audioProcess.on("exit", () => {

        playing = false;

        audioProcess = null;

        ui.render();
      });

      audioProcess.on("error", error => {

        playing = false;

        ui.appendLog(`
{red-fg}Playback failed{/red-fg}

${error.message}
        `);
      });

      playing = true;

      startedAt = Date.now();
    } catch (error) {

      playing = false;

      ui.appendLog(`
{red-fg}Playback failed{/red-fg}

${error.message}
      `);
    }
  }

  function stop() {

    cleanup();

    ui.render();
  }

  function toggle() {

    if (playing) {
      stop();
    } else {
      play();
    }
  }

  function next() {

    if (!playlist.length) {
      return;
    }

    stop();

    index++;

    if (index >= playlist.length) {
      index = 0;
    }

    play();
  }

  function prev() {

    if (!playlist.length) {
      return;
    }

    stop();

    index--;

    if (index < 0) {
      index = playlist.length - 1;
    }

    play();
  }

  function isPlaying() {
    return playing;
  }

  function getIndex() {
    return index;
  }

  function getPlaylist() {
    return playlist;
  }

  function getCurrentTime() {

    if (!playing || !startedAt) {
      return 0;
    }

    return Math.floor(
      (Date.now() - startedAt) / 1000
    );
  }

  function getDuration() {

    return 180;
  }

  return {
    play,
    stop,
    toggle,
    next,
    prev,
    isPlaying,
    getTrack,
    getIndex,
    getPlaylist,
    getCurrentTime,
    getDuration
  };
}
