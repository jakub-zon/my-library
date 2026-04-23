# my-library

My personal book collection from [lubimyczytac.pl](https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af), published as a static site on GitHub Pages.

## Layout

- `scraper/` — Python script that pulls listing + detail pages from LC
- `docs/books.json` + `docs/books-details.json` + `docs/meta.json` — scraper output (committed, served by Pages)
- `docs/{read-plan,accepted,rejections}.json` — skill state files (committed, served by Pages)
- `docs/{index,book,reading-plan,accepted,rejected}.html` — main table + book detail + 3 subpages (vanilla JS, no build)
- `.claude/skills/library-advisor/` — Claude Code skill for recommendations / announcements / market research
- `.github/workflows/` — GitHub Actions (manual update trigger)
