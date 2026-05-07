// Shared LIST_CONFIG builder for shelf-filtered subpages.
// Each shelf page sets window.SHELF_NAME (e.g. "Do sprawdzenia") and includes
// this script before list-view.js. Lists books from books.json that have that
// shelf assigned.

(() => {
  const SHELF = window.SHELF_NAME;
  if (!SHELF) {
    console.error("SHELF_NAME missing — page misconfigured");
    return;
  }

  const COLLATOR = new Intl.Collator("pl", { sensitivity: "base", numeric: true });

  window.LIST_CONFIG = {
    emptyMessage: `Pusto. Półka „${SHELF}” w LC jest aktualnie pusta.`,
    loadEntries: async () => {
      const r = await fetch("./books.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(`books.json: ${r.status}`);
      const data = await r.json();
      return (data.books || [])
        .filter((b) => (b.shelves || []).includes(SHELF))
        .map((b) => ({ _lib: b }));
    },
    sort: (a, b) => {
      const aa = (a._lib?.authors || []).join(", ");
      const bb = (b._lib?.authors || []).join(", ");
      const c = COLLATOR.compare(aa, bb);
      if (c !== 0) return c;
      return COLLATOR.compare(a._lib?.title || "", b._lib?.title || "");
    },
    columns: [
      {
        label: "Okładka",
        cls: "cover",
        render: (e, { escape }) => {
          const src = e._lib?.cover;
          return src ? `<img src="${escape(src)}" alt="" loading="lazy">` : "";
        },
      },
      {
        label: "Tytuł",
        cls: "title",
        render: (e, { escape }) => {
          const id = e._lib?.id;
          const title = e._lib?.title || "";
          if (id) {
            return `<a href="./book.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">${escape(title)}</a>`;
          }
          return escape(title);
        },
      },
      {
        label: "Autor",
        render: (e, { escape }) => escape((e._lib?.authors || []).join(", ")),
      },
      {
        label: "Cykl",
        cls: "cycle",
        render: (e, { escape }) => {
          const c = e._lib?.cycle;
          return c ? escape(c) : `<span class="dash">—</span>`;
        },
      },
      {
        label: "Śr. LC",
        cls: "num",
        render: (e) => {
          const r = e._lib?.average_rating;
          return r != null ? r.toFixed(1) : `<span class="dash">—</span>`;
        },
      },
      {
        label: "Inne półki",
        cls: "shelves",
        render: (e, { escape }) => {
          const others = (e._lib?.shelves || []).filter((s) => s !== SHELF);
          if (!others.length) return `<span class="dash">—</span>`;
          return others.map((s) => `<span class="shelf-pill">${escape(s)}</span>`).join("");
        },
      },
    ],
  };
})();
