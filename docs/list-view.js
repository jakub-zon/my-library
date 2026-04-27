// Shared loader for read-plan / accepted / rejected list pages.
// Each subpage sets window.LIST_CONFIG = { file, joinLibrary, columns, emptyMessage }
// then includes this script.

(() => {
  const cfg = window.LIST_CONFIG;
  if (!cfg) {
    console.error("LIST_CONFIG missing — page misconfigured");
    return;
  }

  const el = {
    tbody: document.querySelector("#entries tbody"),
    thead: document.querySelector("#entries thead tr"),
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

  const renderHeader = () => {
    el.thead.innerHTML = cfg.columns
      .map((c) => `<th${c.cls ? ` class="${c.cls}"` : ""}>${escape(c.label)}</th>`)
      .join("");
  };

  const renderRows = (rows) => {
    if (rows.length === 0) {
      const colspan = cfg.columns.length;
      el.tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty">${escape(cfg.emptyMessage || "Pusto.")}</td></tr>`;
      return;
    }
    el.tbody.innerHTML = rows
      .map((row) => {
        const cells = cfg.columns.map((c) => c.render(row, { escape, fmtDate }));
        return `<tr>${cells.map((x, i) => `<td${cfg.columns[i].cls ? ` class="${cfg.columns[i].cls}"` : ""}>${x}</td>`).join("")}</tr>`;
      })
      .join("");
  };

  const loadJson = async (path) => {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };

  const init = async () => {
    renderHeader();
    try {
      const data = await loadJson(cfg.file);
      let entries = data.entries || [];

      if (cfg.joinLibrary) {
        let library = {};
        try {
          const books = await loadJson("./books.json");
          for (const b of books.books || []) library[String(b.id)] = b;
        } catch (e) {
          console.warn("books.json join failed:", e);
        }
        entries = entries.map((e) => ({ ...e, _lib: library[String(e.id)] || null }));
      }

      // Most recent first
      entries.sort((a, b) => {
        const av = a.when || "";
        const bv = b.when || "";
        return bv.localeCompare(av);
      });

      renderRows(entries);
      const base = `${entries.length} ${entries.length === 1 ? "wpis" : "wpisów"}`;
      const extra = typeof cfg.summary === "function" ? cfg.summary(entries) : "";
      el.stats.textContent = extra ? `${base} — ${extra}` : base;
    } catch (err) {
      el.stats.textContent = `Błąd ładowania: ${err.message}`;
      el.tbody.innerHTML = "";
    }
  };

  init();
})();
