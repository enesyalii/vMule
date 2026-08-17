const { stamp } = require("../state");

/** Bandwidth-aware transfer simulation — splits caps across active downloads. */
function advance(state) {
  const downLimit = state.settings.maxDown === 0 ? 9_000_000 : state.settings.maxDown * 1024;
  const upLimit = state.settings.maxUp === 0 ? 2_000_000 : state.settings.maxUp * 1024;
  let down = 0;
  let up = 0;

  const online = state.connected && state.vmlf?.connected;

  if (online) {
    const active = state.downloads.filter((d) => d.status === "downloading" && d.progress < 1);
    const share = active.length ? downLimit / active.length : 0;

    for (const d of state.downloads) {
      if (d.status !== "downloading" || d.progress >= 1) {
        d.speed = 0;
        continue;
      }
      const want = 20_000 + Math.random() * 180_000;
      const speed = Math.floor(Math.min(share, want));
      d.speed = speed;
      d.progress = Math.min(1, d.progress + speed / d.size);
      d.bytesDone = Math.floor(d.size * d.progress);
      d.sourcesXfer = Math.max(1, d.sourcesXfer + Math.floor(Math.random() * 3) - 1);
      down += speed;

      if (d.progress >= 1) {
        d.progress = 1;
        d.bytesDone = d.size;
        d.status = "complete";
        d.complete = true;
        d.speed = 0;
        state.logs.unshift(`[${stamp()}] Completed: ${d.name}`);
        if (!state.shared.find((s) => s.hash === d.hash)) {
          state.shared.push({ ...d, status: "sharing" });
        }
      }
    }

    for (const u of state.uploads) {
      u.speed = 8_000 + Math.floor(Math.random() * 40_000);
      u.xfer += u.speed;
      up += u.speed;
    }
  } else {
    for (const d of state.downloads) d.speed = 0;
    for (const u of state.uploads) u.speed = 0;
  }

  down = Math.min(down, downLimit);
  up = Math.min(up, upLimit);
  state.stats.sessionDown += down;
  state.stats.sessionUp += up;
  state.stats.downTotal += down;
  state.stats.upTotal += up;
  state.stats.historyDown.push(down);
  state.stats.historyUp.push(up);
  if (state.stats.historyDown.length > 90) state.stats.historyDown.shift();
  if (state.stats.historyUp.length > 90) state.stats.historyUp.shift();
  state.currentDown = down;
  state.currentUp = up;
}

module.exports = { advance };
