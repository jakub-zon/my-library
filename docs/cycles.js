// Cycles/series overview. Grouping and anomaly flags (duplicate tom,
// numbering gap, shelf mismatch) are precomputed by scraper/scrape.py into
// docs/cycles.json — this script only renders and handles the expand/collapse
// interaction, no parsing/interpretation logic lives here.
(() => {
  const el = {
    tbody: document.querySelector("#cycles tbody"),
    stats: document.getElementById("stats"),
  };

  const COLLATOR = new Intl.Collator("pl", { sensitivity: "base", numeric: true });

  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escape(iso);
    return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const state = { cycles: [], expanded: new Set() };

  const shelfBreakdown = (volumes) => {
    const counts = new Map();
    for (const v of volumes) {
      for (const s of v.shelves || []) counts.set(s, (counts.get(s) || 0) + 1);
    }
    const names = [...counts.keys()].sort(COLLATOR.compare);
    return names.map((n) => `${n} ×${counts.get(n)}`).join(" · ");
  };

  const renderFlags = (flags) =>
    (flags || [])
      .map((f) => `<span class="flag-badge" title="${escape(f.detail || f.label)}">⚠ ${escape(f.label)}</span>`)
      .join(" ");

  const renderVolumeRow = (v) => {
    const shelves = (v.shelves || []).map((s) => `<span class="shelf-pill">${escape(s)}</span>`).join("");
    const avg = v.average_rating != null ? v.average_rating.toFixed(1) : `<span class="dash">—</span>`;
    const mine = v.user_rating != null ? v.user_rating.toFixed(1) : `<span class="dash">—</span>`;
    const readDate = v.read_date ? fmtDate(v.read_date) : `<span class="dash">—</span>`;
    const title = v.id
      ? `<a href="./book.html?id=${encodeURIComponent(v.id)}" target="_blank" rel="noopener">${escape(v.title || "")}</a>`
      : escape(v.title || "");
    return `
      <tr class="volume-row">
        <td class="num">${escape(v.tom_label)}</td>
        <td class="title">${title}</td>
        <td class="shelves">${shelves}</td>
        <td class="num">${avg}</td>
        <td class="num">${mine}</td>
        <td class="num">${readDate}</td>
      </tr>`;
  };

  const renderDetail = (cycle) => `
    <table class="volume-table">
      <colgroup>
        <col class="col-tom"><col class="col-title"><col class="col-shelves">
        <col class="col-num"><col class="col-num"><col class="col-num">
      </colgroup>
      <thead>
        <tr><th>Tom</th><th>Tytuł</th><th>Półki</th><th>Śr. LC</th><th>Moja</th><th>Przeczytano</th></tr>
      </thead>
      <tbody>${cycle.volumes.map(renderVolumeRow).join("")}</tbody>
    </table>`;

  const render = () => {
    if (!state.cycles.length) {
      el.tbody.innerHTML = `<tr><td colspan="6" class="empty">Brak cykli w bibliotece.</td></tr>`;
      return;
    }
    const rows = state.cycles.map((c) => {
      const isOpen = state.expanded.has(c.name);
      const cover = c.volumes[0]?.cover;
      const coverCell = cover ? `<img src="${escape(cover)}" alt="" loading="lazy">` : "";
      const nameCell = `
        <button class="expand-toggle" type="button" data-cycle="${escape(c.name)}" aria-expanded="${isOpen}" aria-label="${isOpen ? "Zwiń szczegóły" : "Rozwiń szczegóły"}">▶</button>
        ${escape(c.name)}
      `;
      const mainRow = `
        <tr class="cycle-row${isOpen ? " is-open" : ""}" data-cycle="${escape(c.name)}">
          <td class="cover">${coverCell}</td>
          <td class="title">${nameCell}</td>
          <td class="authors">${escape((c.authors || []).join(", "))}</td>
          <td class="num">${c.volumes.length}</td>
          <td class="flags">${renderFlags(c.flags)}</td>
          <td class="shelves">${escape(shelfBreakdown(c.volumes))}</td>
        </tr>`;
      const detailRow = isOpen
        ? `<tr class="detail-row" data-cycle="${escape(c.name)}"><td></td><td colspan="5" class="detail-cell">${renderDetail(c)}</td></tr>`
        : "";
      return mainRow + detailRow;
    });
    el.tbody.innerHTML = rows.join("");
    const flagged = state.cycles.filter((c) => (c.flags || []).length > 0).length;
    el.stats.textContent = `${state.cycles.length} cykli — ${flagged} oznaczonych`;
  };

  const onBodyClick = (ev) => {
    const toggle = ev.target.closest(".expand-toggle");
    if (!toggle) return;
    const name = toggle.dataset.cycle;
    if (state.expanded.has(name)) state.expanded.delete(name);
    else state.expanded.add(name);
    render();
  };

  const loadJson = async (path) => {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };

  const init = async () => {
    try {
      const data = await loadJson("./cycles.json");
      const cycles = data.cycles || [];
      // Display order only: cycles with more distinct flags surface first.
      cycles.sort((a, b) => {
        const fa = (a.flags || []).length, fb = (b.flags || []).length;
        if (fa !== fb) return fb - fa;
        return COLLATOR.compare(a.name, b.name);
      });
      state.cycles = cycles;
      el.tbody.addEventListener("click", onBodyClick);
      render();
    } catch (err) {
      el.stats.textContent = `Błąd ładowania: ${err.message}`;
    }
  };

  init();
})();
