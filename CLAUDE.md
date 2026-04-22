# my-library

Static site on GitHub Pages showing my book collection from lubimyczytac.pl. Repo: `jakub-zon/my-library`.

## Architecture

```
scraper/scrape.py            Python (httpx + BeautifulSoup) — pulls listing + detail pages from LC
docs/books.json              Listing output (scraper-written; served by GH Pages)
docs/books-details.json      Per-book enrichment: {description, genre, pages}
docs/{read-plan,accepted,rejections}.json  Skill state files (skill-written; served by GH Pages)
docs/{index.html,app.js,style.css,list-view.js}  Main table + shared list-view loader
docs/{reading-plan,accepted,rejected}.html Subpages for the state files (nav-linked)
.claude/skills/library-advisor/SKILL.md    Claude Code skill — recommendations, announcements, market research
.github/workflows/update.yml Manual trigger (workflow_dispatch): scrape → enrich → commit → Pages deploy
```

GitHub Pages is configured to serve from the `/docs` folder on `main`. The main page is a vanilla JS table fetching `books.json`. Subpages share `list-view.js` and each fetches its own state JSON (joining with `books.json` where useful).

**State files are public** (repo is public). Entries contain `{id?, title, author, url?, cover_url?, source, when, note?}`. The `source` field is one of `library` (from user's shelf), `announcement` (from katedra/LC zapowiedzi), `market` (external research).

## Data source

- URL: `https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af` (shortlink to the user's shelf; profile id 1806091, nick "qba")
- **Page 1:** GET `BASE_URL` with query params (`?page=1&listId=booksFilteredList&kolejnosc=data-dodania&showFirstLetter=0&listType=list&objectId=1806091&own=0&paginatorType=Standard`). Returns full HTML with 20 book cards and the paginator.
- **Pages 2+ do NOT work via GET** — the server always returns page 1 (anti-bot / query-string cache). Must be fetched via **POST** to `/profile/getLibraryBooksList` with form data: `page=N`, `paginatorId=booksFilteredListPaginatorButton`, the remaining query params, and `_req=<float timestamp>`. Required headers: `X-Requested-With: XMLHttpRequest`, `Referer: BASE_URL`, plus the session cookie obtained from visiting page 1. Returns JSON `{code:"OK", data:{content:"<html…>"}}`; the HTML inside uses the same selectors as the full page.
- ~27 pages × 20 books (~531 visible anonymously; full collection is slightly larger — see "Logged-out gap" below). Data is server-rendered in HTML — **no Playwright needed**.
- Fields to extract: `id`, `title`, `url`, `type` (`book` | `audiobook`), `authors[]`, `average_rating` (LC community), `user_rating` (only on "Przeczytane"), `shelves[]`, `cycle` (optional), `cover`.

### Counter mismatch

LC's sidebar totals ("KSIĄŻKI W BIBLIOTECZCE [533]", "Posiadane 316", "Chcę przeczytać 265", etc.) are slightly off — they're inflated by ~2 relative to what the paginated list actually contains. Verified: on the `Posiadane` filter the last page has 14 entries, giving 15×20 + 14 = **314** (matches scraper), while the sidebar insists on 316. Same 2-book drift appears on `Chcę przeczytać` and `Do przeczytania`. **Treat the scraper total as ground truth, ignore the sidebar counter.** Do not chase these "missing" books — they don't exist on any visible page.

## Conventions

- **Scraper:** Python 3, `httpx` + `BeautifulSoup`. Rate limit: min. 1s sleep between requests (be polite). Set a realistic `User-Agent`. Always test selectors against one page before running the full scrape.
- **Data updates:** manual only, via `workflow_dispatch` in Actions. The user explicitly opted out of schedules/cron.
- **CORS:** the static site cannot fetch LC directly from the browser — CORS blocks it. Data always flows through the scraper → `data/books.json` in the repo.
- **Output format:** JSON (not CSV) — the site is a JS renderer, a list of objects with the fields listed above.
- **Commits:** small, topical. **English** commit messages (user preference).
- **Language:** **English** for all project files, docs, comments, and commit messages. Polish only for chat.

## Don't

- Don't add a JS scraper in `site/` — CORS will kill it.
- Don't ship a GitHub token in `site/` — the repo is public.
- Don't use Playwright/Selenium — data is in HTML, it would be overkill.
