# my-library

Static site on GitHub Pages showing my book collection from lubimyczytac.pl. Repo: `jakub-zon/my-library`.

## Architecture

```
scraper/        Python (httpx + BeautifulSoup) — pulls data from LC
data/books.json Scraper output, committed to the repo
site/           Static HTML/CSS/JS that fetches books.json and renders it
.github/workflows/update.yml  Manual trigger (workflow_dispatch): scrape → commit → Pages deploy
```

## Data source

- URL: `https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af` (shortlink to the user's shelf; profile id 1806091, nick "qba")
- **Page 1:** GET `BASE_URL` with query params (`?page=1&listId=booksFilteredList&kolejnosc=data-dodania&showFirstLetter=0&listType=list&objectId=1806091&own=0&paginatorType=Standard`). Returns full HTML with 20 book cards and the paginator.
- **Pages 2+ do NOT work via GET** — the server always returns page 1 (anti-bot / query-string cache). Must be fetched via **POST** to `/profile/getLibraryBooksList` with form data: `page=N`, `paginatorId=booksFilteredListPaginatorButton`, the remaining query params, and `_req=<float timestamp>`. Required headers: `X-Requested-With: XMLHttpRequest`, `Referer: BASE_URL`, plus the session cookie obtained from visiting page 1. Returns JSON `{code:"OK", data:{content:"<html…>"}}`; the HTML inside uses the same selectors as the full page.
- ~27 pages × 20 books (~531 visible anonymously; full collection is slightly larger — see "Logged-out gap" below). Data is server-rendered in HTML — **no Playwright needed**.
- Fields to extract: `id`, `title`, `url`, `type` (`book` | `audiobook`), `authors[]`, `average_rating` (LC community), `user_rating` (only on "Przeczytane"), `shelves[]`, `cycle` (optional), `cover`.

### Logged-out gap

The anonymous shortlink hides ~2 books that the owner sees when logged in (likely books the owner marked as "hidden from others"). If full parity with the logged-in count is required, the scraper has to be authenticated — pass `lc_session` (and possibly `lc_memberId`) cookies from a browser session via env var or GitHub Secret. Otherwise accept ~99.6% coverage.

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
