const { catalogItem, stamp } = require("../state");
const { getCatalog } = require("../catalog");

function runSearch(state, { term, type, network }) {
  const q = (term || "").toLowerCase().trim();
  state.search.term = term || "";
  state.search.running = false;
  state.search.network = network || "kad";

  const pool = getCatalog().filter((item) => {
    if (type && type !== "Any" && item.type !== type) return false;
    if (!q) return true;
    return item.name.toLowerCase().includes(q);
  });

  state.search.results = pool.map((item) =>
    catalogItem({
      ...item,
      sources: item.sources + Math.floor(Math.random() * 40),
    })
  );

  state.logs.unshift(
    `[${stamp()}] Search (${network || "kad"}): "${term}" → ${state.search.results.length} results`
  );
}

module.exports = { runSearch };
