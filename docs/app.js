(() => {
  const state = {
    books: [],
    filtered: [],
    sortKey: "title",
    sortDir: 1, // 1 asc, -1 desc
    selectedShelves: new Set(),
  };

  const el = {
    tbody: document.querySelector("#books tbody"),
    thead: document.querySelector("#books thead"),
    stats: document.getElementById("stats"),
    meta: document.getElementById("meta"),
    fTitle: document.getElementById("f-title"),
    fAuthor: document.getElementById("f-author"),
    fCycle: document.getElementById("f-cycle"),
    fShelves: document.getElementById("f-shelves"),
    fClear: document.getElementById("f-clear"),
  };

  const COLLATOR = new Intl.Collator("pl", { sensitivity: "base", numeric: true });

  const normalize = (s) => (s || "").toString().toLocaleLowerCase("pl");

  const sortValue = (book, key) => {
    switch (key) {
      case "authors": return (book.authors || []).join(", ");
      case "shelves": return (book.shelves || []).join(", ");
      case "average_rating":
      case "user_rating":
        return book[key] ?? -1;
      default:
        return book[key] ?? "";
    }
  };

  const compare = (a, b, key) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (typeof va === "number" && typeof vb === "number") return va - vb;
    return COLLATOR.compare(String(va), String(vb));
  };

  const stripTomSuffix = (cycle) =>
    (cycle || "").replace(/\s*\([^)]*tom[^)]*\)\s*$/i, "").trim();

  const render = () => {
    const rows = state.filtered.map((b) => {
      const authors = (b.authors || [])
        .map((a) => `<span class="clickable" data-filter="author" data-value="${escape(a)}">${escape(a)}</span>`)
        .join(", ");
      const shelves = (b.shelves || [])
        .map((s) => `<span class="shelf-pill clickable" data-filter="shelf" data-value="${escape(s)}">${escape(s)}</span>`)
        .join("");
      const cover = b.cover
        ? `<img src="${escape(b.cover)}" alt="" loading="lazy">`
        : "";
      const cycleText = b.cycle || "";
      const cycleBare = stripTomSuffix(cycleText);
      const cycle = cycleText
        ? `<span class="clickable" data-filter="cycle" data-value="${escape(cycleBare)}">${escape(cycleText)}</span>`
        : `<span class="dash">—</span>`;
      const avg = b.average_rating != null ? b.average_rating.toFixed(1) : `<span class="dash">—</span>`;
      const mine = b.user_rating != null ? b.user_rating.toFixed(1) : `<span class="dash">—</span>`;
      return `
        <tr>
          <td class="cover">${cover}</td>
          <td class="title"><a href="${escape(b.url || "#")}" target="_blank" rel="noopener">${escape(b.title || "")}</a></td>
          <td class="authors">${authors}</td>
          <td class="cycle">${cycle}</td>
          <td class="num">${avg}</td>
          <td class="num">${mine}</td>
          <td class="shelves">${shelves}</td>
        </tr>`;
    });
    el.tbody.innerHTML = rows.join("");
    el.stats.textContent = `${state.filtered.length} / ${state.books.length} książek`;
  };

  const escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const applyFilters = () => {
    const title = normalize(el.fTitle.value.trim());
    const author = normalize(el.fAuthor.value.trim());
    const cycle = normalize(el.fCycle.value.trim());
    const required = state.selectedShelves;

    state.filtered = state.books.filter((b) => {
      if (title && !normalize(b.title).includes(title)) return false;
      if (author) {
        const joined = normalize((b.authors || []).join(" "));
        if (!joined.includes(author)) return false;
      }
      if (cycle && !normalize(b.cycle).includes(cycle)) return false;
      if (required.size > 0) {
        const have = new Set(b.shelves || []);
        for (const s of required) if (!have.has(s)) return false;
      }
      return true;
    });

    updateShelfPillStates();
    applySort();
  };

  const applySort = () => {
    state.filtered.sort((a, b) => state.sortDir * compare(a, b, state.sortKey));
    render();
    updateSortHeaders();
  };

  const updateSortHeaders = () => {
    el.thead.querySelectorAll("th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === state.sortKey) {
        th.classList.add(state.sortDir === 1 ? "sorted-asc" : "sorted-desc");
      }
    });
  };

  const buildShelfOptions = () => {
    const shelves = new Set();
    for (const b of state.books) for (const s of (b.shelves || [])) shelves.add(s);
    const sorted = [...shelves].sort(COLLATOR.compare);
    el.fShelves.innerHTML = "";
    for (const s of sorted) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shelf-toggle";
      btn.dataset.shelf = s;
      btn.textContent = s;
      el.fShelves.appendChild(btn);
    }
  };

  const toggleShelf = (shelf) => {
    if (state.selectedShelves.has(shelf)) {
      state.selectedShelves.delete(shelf);
    } else {
      state.selectedShelves.add(shelf);
    }
    applyFilters();
  };

  const updateShelfPillStates = () => {
    el.fShelves.querySelectorAll(".shelf-toggle").forEach((btn) => {
      btn.classList.toggle("active", state.selectedShelves.has(btn.dataset.shelf));
    });
  };

  const onHeaderClick = (ev) => {
    const th = ev.target.closest("th");
    if (!th || th.classList.contains("no-sort")) return;
    const key = th.dataset.sort;
    if (!key) return;
    if (state.sortKey === key) {
      state.sortDir *= -1;
    } else {
      state.sortKey = key;
      state.sortDir = 1;
    }
    applySort();
  };

  const onBodyClick = (ev) => {
    const target = ev.target.closest(".clickable");
    if (!target) return;
    const filter = target.dataset.filter;
    const value = target.dataset.value || "";
    if (filter === "author") {
      el.fAuthor.value = value;
      applyFilters();
    } else if (filter === "cycle") {
      el.fCycle.value = value;
      applyFilters();
    } else if (filter === "shelf") {
      toggleShelf(value);
    }
  };

  const bind = () => {
    el.thead.addEventListener("click", onHeaderClick);
    el.tbody.addEventListener("click", onBodyClick);
    el.fTitle.addEventListener("input", applyFilters);
    el.fAuthor.addEventListener("input", applyFilters);
    el.fCycle.addEventListener("input", applyFilters);
    el.fShelves.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".shelf-toggle");
      if (btn) toggleShelf(btn.dataset.shelf);
    });
    el.fClear.addEventListener("click", () => {
      el.fTitle.value = "";
      el.fAuthor.value = "";
      el.fCycle.value = "";
      state.selectedShelves.clear();
      applyFilters();
    });
  };

  const formatAge = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const deltaMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (deltaMin < 1) return "przed chwilą";
    if (deltaMin < 60) return `${deltaMin} min temu`;
    const deltaH = Math.floor(deltaMin / 60);
    if (deltaH < 24) return `${deltaH} h temu`;
    const deltaD = Math.floor(deltaH / 24);
    return `${deltaD} dni temu`;
  };

  const loadMeta = async () => {
    try {
      const r = await fetch("./meta.json", { cache: "no-cache" });
      if (!r.ok) return;
      const m = await r.json();
      const age = formatAge(m.generated_at);
      if (age && el.meta) {
        el.meta.textContent = `Ostatnia aktualizacja: ${age}`;
      }
    } catch {
      // meta.json is optional
    }
  };

  const init = async () => {
    const r = await fetch("./books.json", { cache: "no-cache" });
    if (!r.ok) {
      el.stats.textContent = `Failed to load books.json: ${r.status}`;
      return;
    }
    const payload = await r.json();
    state.books = payload.books || [];
    state.filtered = state.books.slice();
    buildShelfOptions();
    bind();
    applySort();
    loadMeta();
  };

  init();
})();
