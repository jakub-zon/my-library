# my-library

Statyczna strona na GitHub Pages wyświetlająca mój księgozbiór z lubimyczytac.pl. Repo: `jakub-zon/my-library`.

## Architektura

```
scraper/        Python (httpx + BeautifulSoup) — pobiera dane z LC
data/books.json Wyjście scrapera, commitowane do repo
site/           Statyczny HTML/CSS/JS, fetchuje books.json i renderuje
.github/workflows/update.yml  Ręczny trigger (workflow_dispatch): scrape → commit → Pages deploy
```

## Źródło danych

- URL: `https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af`
- Strona 1: GET na `BASE_URL` z query params (`?page=1&listId=booksFilteredList&kolejnosc=data-dodania&showFirstLetter=0&listType=list&objectId=1806091&own=0&paginatorType=Standard`). Zwraca pełny HTML z 20 książkami i paginatorem.
- **Strony 2+ NIE działają przez GET** — serwer zwraca wtedy zawsze stronę 1 (anti-bot / cache na query string). Muszą iść POST-em do `/profile/getLibraryBooksList` z form-dataem zawierającym `page=N`, `paginatorId=booksFilteredListPaginatorButton`, pozostałe query params + `_req=<timestamp float>`. Wymagane nagłówki: `X-Requested-With: XMLHttpRequest`, `Referer: BASE_URL`, cookie sesyjne z wcześniejszej wizyty strony 1. Zwraca JSON `{code:"OK", data:{content:"<html…>"}}`; ten HTML ma te same selektory co pełna strona.
- ~27 stron × 20 książek (~531 w sumie). Dane są w HTML (server-rendered), **nie** trzeba Playwrighta.
- Pola do wyciągnięcia: tytuł, autor, ocena użytkownika, półka (Przeczytane / Chcę przeczytać / Teraz czytam)

## Konwencje

- **Scraper:** Python 3, `httpx` + `BeautifulSoup`. Rate limit: min. 1s sleep między requestami (bądź grzeczny wobec LC). Ustaw rozsądny `User-Agent`. Zawsze przetestuj selektory na 1 stronie przed pełnym runem.
- **Aktualizacja danych:** tylko ręcznie przez `workflow_dispatch` w Actions — użytkownik jawnie nie chce harmonogramu/crona.
- **CORS uwaga:** strona nie może fetchować LC bezpośrednio z przeglądarki — CORS blokuje. Dane zawsze przechodzą przez scraper → `books.json` w repo.
- **Wyjście scrapera:** JSON (nie CSV), lista obiektów z polami `title`, `author`, `user_rating`, `shelf`, plus cokolwiek co się przyda przy renderowaniu.
- **Commity:** prefer małych, tematycznych commitów. Commit message po polsku albo angielsku — spójnie w ramach wątku.

## Czego nie robić

- Nie dodawać JS-owego scrapera w `site/` — CORS to zabije.
- Nie dodawać tokenów GitHub do `site/` — repo jest publiczne.
- Nie używać Playwrighta/Selenium — dane są w HTML, to overkill.
