# my-library

My personal book collection from [lubimyczytac.pl](https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af), published as a static site on GitHub Pages.

## Layout

- `scraper/` — Python script that pulls data from LC
- `docs/books.json` — scraper output (committed, served by Pages)
- `docs/{index.html,app.js,style.css}` — static site (vanilla, no build)
- `.github/workflows/` — GitHub Actions (manual update trigger)
