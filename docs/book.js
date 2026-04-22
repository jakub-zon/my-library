(() => {
  const params = new URLSearchParams(location.search);
  const bookId = params.get("id");

  const el = {
    status: document.getElementById("status"),
    article: document.getElementById("book"),
    cover: document.getElementById("b-cover"),
    title: document.getElementById("b-title"),
    authors: document.getElementById("b-authors"),
    cycle: document.getElementById("b-cycle"),
    avg: document.getElementById("b-avg"),
    mine: document.getElementById("b-mine"),
    shelves: document.getElementById("b-shelves"),
    genre: document.getElementById("b-genre"),
    pages: document.getElementById("b-pages"),
    lc: document.getElementById("b-lc"),
    desc: document.getElementById("b-desc"),
  };

  const escape = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const fail = (msg) => {
    el.status.textContent = msg;
    document.title = "Nie znaleziono — my-library";
  };

  const loadJson = async (path) => {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };

  const render = (book, details) => {
    document.title = `${book.title} — my-library`;

    if (book.cover) {
      el.cover.src = book.cover;
      el.cover.alt = `Okładka książki ${book.title}`;
    } else {
      el.cover.remove();
    }

    el.title.textContent = book.title || "";
    el.authors.textContent = (book.authors || []).join(", ");
    if (book.cycle) {
      el.cycle.textContent = `Cykl: ${book.cycle}`;
    } else {
      el.cycle.remove();
    }

    if (book.average_rating != null) {
      el.avg.innerHTML = `<strong>Śr. LC:</strong> ${book.average_rating.toFixed(1)} / 10`;
    } else {
      el.avg.remove();
    }
    if (book.user_rating != null) {
      el.mine.innerHTML = `<strong>Moja:</strong> ${book.user_rating.toFixed(1)} / 10`;
    } else {
      el.mine.remove();
    }

    const shelves = book.shelves || [];
    if (shelves.length) {
      el.shelves.innerHTML = shelves.map((s) => `<span class="shelf-pill">${escape(s)}</span>`).join("");
    } else {
      el.shelves.remove();
    }

    if (details) {
      if (details.error === "404") {
        el.genre.innerHTML = `<span class="dash">—</span>`;
        el.pages.innerHTML = `<span class="dash">—</span>`;
        el.desc.innerHTML = `<p class="detail-empty">Strona tej książki zniknęła z LC (404).</p>`;
      } else {
        if (details.genre) el.genre.textContent = details.genre;
        if (details.pages) el.pages.textContent = String(details.pages);
        if (details.description) {
          el.desc.innerHTML = escape(details.description).replace(/\n/g, "<br>");
        } else {
          el.desc.innerHTML = `<p class="detail-empty">Brak opisu.</p>`;
        }
      }
    } else {
      el.desc.innerHTML = `<p class="detail-empty">Szczegóły w trakcie pobierania. Odśwież za chwilę.</p>`;
    }

    if (book.url) {
      el.lc.href = book.url;
      el.lc.hidden = false;
    }

    el.status.hidden = true;
    el.article.hidden = false;
  };

  const init = async () => {
    if (!bookId) {
      fail("Brak ID książki w URL.");
      return;
    }
    let books;
    try {
      books = await loadJson("./books.json");
    } catch (e) {
      fail(`Nie udało się załadować biblioteki: ${e.message}`);
      return;
    }
    const book = (books.books || []).find((b) => String(b.id) === String(bookId));
    if (!book) {
      fail(`Nie znaleziono książki o ID ${bookId}.`);
      return;
    }
    let details = null;
    try {
      const detailsMap = await loadJson("./books-details.json");
      details = detailsMap[String(bookId)] || null;
    } catch {
      details = null;
    }
    render(book, details);
  };

  init();
})();
