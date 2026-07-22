// Cycles/series overview — groups books.json by the `cycle` field and
// surfaces per-series anomalies (duplicate tom, numbering gap, shelf
// mismatch) to help declutter the collection at the series level.
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

  // Most cycle strings are "<name> (tom N)". A minority are omnibus editions
  // spanning several tomes, "<name> (tom N-M)" — captured as a range so gap
  // detection treats the whole span as covered, not just N.
  const CYCLE_RE = /^(.*?)\s*\(tom\s*([\d.]+)(?:\s*[-–]\s*([\d.]+))?\)\s*$/i;
  const FALLBACK_NAME_RE = /^(.*?)\s*\(tom/i;
  const FALLBACK_NUM_RE = /\(tom\s*([\d.]+)/i;

  const state = { groups: [], expanded: new Set() };

  const parseCycle = (cycleStr) => {
    if (!cycleStr) return null;
    const m = CYCLE_RE.exec(cycleStr);
    if (m) {
      const from = parseFloat(m[2]);
      const to = m[3] !== undefined ? parseFloat(m[3]) : from;
      return { name: m[1].trim(), tomFrom: from, tomTo: to };
    }
    // Malformed edge case (e.g. a triple-range typo on LC's side) — best
    // effort: still group it by name, using the first number found.
    const fb = FALLBACK_NUM_RE.exec(cycleStr);
    if (!fb) return null;
    const nameMatch = FALLBACK_NAME_RE.exec(cycleStr);
    const name = nameMatch ? nameMatch[1].trim() : cycleStr;
    const from = parseFloat(fb[1]);
    return { name, tomFrom: from, tomTo: from };
  };

  const tomLabel = (v) => (v.tomFrom === v.tomTo ? String(v.tomFrom) : `${v.tomFrom}–${v.tomTo}`);

  const unionAuthors = (volumes) => {
    const seen = new Set();
    const out = [];
    for (const v of volumes) {
      for (const a of v.authors || []) {
        if (!seen.has(a)) { seen.add(a); out.push(a); }
      }
    }
    return out;
  };

  const computeFlags = (volumes) => {
    const flags = [];

    const byLabel = new Map();
    for (const v of volumes) {
      const key = `${v.tomFrom}-${v.tomTo}`;
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(v);
    }
    const dups = [...byLabel.values()].filter((vs) => vs.length > 1);
    if (dups.length) {
      const detail = dups
        .map((vs) => `tom ${tomLabel(vs[0])}: ${vs.map((v) => `${v.title} (${(v.shelves || []).join(", ") || "brak półek"})`).join(" vs ")}`)
        .join("; ");
      flags.push({ key: "dup-tom", label: "zdublowany tom", title: `Zdublowany tom — ${detail}` });
    }

    const covered = new Set();
    for (const v of volumes) {
      for (let n = Math.ceil(v.tomFrom); n <= Math.floor(v.tomTo); n++) covered.add(n);
    }
    const ints = [...covered].sort((a, b) => a - b);
    if (ints.length >= 2) {
      const missing = [];
      for (let n = ints[0]; n <= ints[ints.length - 1]; n++) {
        if (!covered.has(n)) missing.push(n);
      }
      if (missing.length) {
        flags.push({ key: "gap", label: "luka w numeracji", title: `Brakujące tomy: ${missing.join(", ")}` });
      }
    }

    const shelfSets = volumes.map((v) => JSON.stringify([...(v.shelves || [])].sort()));
    if (new Set(shelfSets).size > 1) {
      flags.push({
        key: "shelf-mismatch",
        label: "rozbieżność półek",
        title: "Tomy tego cyklu mają różne zestawy półek — rozwiń, by zobaczyć szczegóły.",
      });
    }

    return flags;
  };

  const shelfBreakdown = (volumes) => {
    const counts = new Map();
    for (const v of volumes) {
      for (const s of v.shelves || []) counts.set(s, (counts.get(s) || 0) + 1);
    }
    const names = [...counts.keys()].sort(COLLATOR.compare);
    return names.map((n) => `${n} ×${counts.get(n)}`).join(" · ");
  };

  const buildGroups = (books) => {
    const map = new Map();
    for (const b of books) {
      const parsed = parseCycle(b.cycle);
      if (!parsed) continue;
      if (!map.has(parsed.name)) map.set(parsed.name, []);
      map.get(parsed.name).push({ ...b, tomFrom: parsed.tomFrom, tomTo: parsed.tomTo });
    }
    const groups = [];
    for (const [name, volumes] of map) {
      volumes.sort((a, b) => a.tomFrom - b.tomFrom);
      groups.push({
        name,
        volumes,
        authors: unionAuthors(volumes),
        flags: computeFlags(volumes),
      });
    }
    groups.sort((a, b) => {
      if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
      return COLLATOR.compare(a.name, b.name);
    });
    return groups;
  };

  const renderFlags = (flags) =>
    flags.map((f) => `<span class="flag-badge" title="${escape(f.title)}">⚠ ${escape(f.label)}</span>`).join(" ");

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
        <td class="num">${escape(tomLabel(v))}</td>
        <td class="title">${title}</td>
        <td class="shelves">${shelves}</td>
        <td class="num">${avg}</td>
        <td class="num">${mine}</td>
        <td class="num">${readDate}</td>
      </tr>`;
  };

  const renderDetail = (group) => `
    <table class="volume-table">
      <thead>
        <tr><th>Tom</th><th>Tytuł</th><th>Półki</th><th>Śr. LC</th><th>Moja</th><th>Przeczytano</th></tr>
      </thead>
      <tbody>${group.volumes.map(renderVolumeRow).join("")}</tbody>
    </table>`;

  const render = () => {
    if (!state.groups.length) {
      el.tbody.innerHTML = `<tr><td colspan="6" class="empty">Brak cykli w bibliotece.</td></tr>`;
      return;
    }
    const rows = state.groups.map((g) => {
      const isOpen = state.expanded.has(g.name);
      const cover = g.volumes[0]?.cover;
      const coverCell = cover ? `<img src="${escape(cover)}" alt="" loading="lazy">` : "";
      const nameCell = `
        <button class="expand-toggle" type="button" data-cycle="${escape(g.name)}" aria-expanded="${isOpen}" aria-label="${isOpen ? "Zwiń szczegóły" : "Rozwiń szczegóły"}">▶</button>
        ${escape(g.name)}
      `;
      const mainRow = `
        <tr class="cycle-row${isOpen ? " is-open" : ""}" data-cycle="${escape(g.name)}">
          <td class="cover">${coverCell}</td>
          <td class="title">${nameCell}</td>
          <td class="authors">${escape(g.authors.join(", "))}</td>
          <td class="num">${g.volumes.length}</td>
          <td class="flags">${renderFlags(g.flags)}</td>
          <td class="shelves">${escape(shelfBreakdown(g.volumes))}</td>
        </tr>`;
      const detailRow = isOpen
        ? `<tr class="detail-row" data-cycle="${escape(g.name)}"><td></td><td colspan="5" class="detail-cell">${renderDetail(g)}</td></tr>`
        : "";
      return mainRow + detailRow;
    });
    el.tbody.innerHTML = rows.join("");
    const flagged = state.groups.filter((g) => g.flags.length > 0).length;
    el.stats.textContent = `${state.groups.length} cykli — ${flagged} oznaczonych`;
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
      const data = await loadJson("./books.json");
      state.groups = buildGroups(data.books || []);
      el.tbody.addEventListener("click", onBodyClick);
      render();
    } catch (err) {
      el.stats.textContent = `Błąd ładowania: ${err.message}`;
    }
  };

  init();
})();
