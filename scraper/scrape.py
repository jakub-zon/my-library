"""Scrape user's book collection from lubimyczytac.pl into data/books.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

BASE_URL = "https://lubimyczytac.pl/ksiegozbior/4lQWYNc36af"
QUERY_PARAMS = {
    "listId": "booksFilteredList",
    "kolejnosc": "data-dodania",
    "showFirstLetter": "0",
    "listType": "list",
    "objectId": "1806091",
    "own": "0",
    "paginatorType": "Standard",
}
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
}
SLEEP_BETWEEN_REQUESTS_S = 1.5
REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = REPO_ROOT / "data" / "books.json"


def _parse_rating(text: str) -> float | None:
    text = text.strip().replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_card(card: Tag) -> dict:
    book: dict = {}

    card_id = card.get("id", "")
    m = re.match(r"listBookElement(\d+)", card_id)
    if m:
        book["id"] = m.group(1)

    title_el = card.select_one(".authorAllBooks__singleTextTitle")
    if title_el:
        book["title"] = title_el.get_text(strip=True)
        href = title_el.get("href", "") or ""
        book["url"] = f"https://lubimyczytac.pl{href}" if href.startswith("/") else href
        if "/audiobook/" in href:
            book["type"] = "audiobook"
        elif "/ksiazka/" in href:
            book["type"] = "book"

    book["authors"] = [
        a.get_text(strip=True)
        for a in card.select(".authorAllBooks__singleTextAuthor a")
    ]

    avg = None
    user_rating = None
    for rating_block in card.select(".listLibrary__rating"):
        label = rating_block.select_one(".listLibrary__ratingText")
        num = rating_block.select_one(".listLibrary__ratingStarsNumber")
        if not label or not num:
            continue
        label_text = label.get_text(strip=True)
        value = _parse_rating(num.get_text())
        if "Średnia" in label_text:
            avg = value
        elif label_text.startswith("Ocen"):
            user_rating = value
    book["average_rating"] = avg
    book["user_rating"] = user_rating

    book["shelves"] = [
        a.get_text(strip=True)
        for a in card.select(".authorAllBooks__singleTextShelfRight a")
    ]

    cycle_link = card.select_one(".listLibrary__info--cycles a")
    if cycle_link:
        book["cycle"] = re.sub(r"\s+", " ", cycle_link.get_text(strip=True))

    img = card.select_one("img.img-fluid")
    if img:
        book["cover"] = img.get("data-src") or img.get("src")

    return book


def parse_page(html: str) -> tuple[list[dict], int | None]:
    soup = BeautifulSoup(html, "lxml")
    cards = soup.select("div.authorAllBooks__single")
    books = [parse_card(c) for c in cards]

    max_page = None
    pager_input = soup.select_one("input.jsPagerInput[data-maxpage]")
    if pager_input:
        try:
            max_page = int(pager_input.get("data-maxpage", ""))
        except ValueError:
            pass
    return books, max_page


AJAX_URL = "https://lubimyczytac.pl/profile/getLibraryBooksList"
PAGINATOR_ID = "booksFilteredListPaginatorButton"


def fetch_page_html(client: httpx.Client, page: int) -> str:
    """Fetch page 1 as full HTML (seeds cookies + gives us the paginator total)."""
    params = {"page": page, **QUERY_PARAMS}
    r = client.get(BASE_URL, params=params, headers=HEADERS)
    r.raise_for_status()
    return r.text


def fetch_page_ajax(client: httpx.Client, page: int) -> str:
    """Fetch subsequent pages via the AJAX endpoint (a GET returns page 1 regardless)."""
    data = {
        "page": page,
        "paginatorId": PAGINATOR_ID,
        **QUERY_PARAMS,
        "_req": f"{time.time():.11f}",
    }
    r = client.post(
        AJAX_URL,
        data=data,
        headers={
            **HEADERS,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": BASE_URL,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
    )
    r.raise_for_status()
    payload = r.json()
    if payload.get("code") != "OK":
        raise RuntimeError(f"AJAX page {page} failed: {payload}")
    return payload.get("data", {}).get("content", "")


def scrape(max_pages: int | None = None) -> list[dict]:
    all_books: list[dict] = []
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        html = fetch_page_html(client, 1)
        books, detected_max = parse_page(html)
        all_books.extend(books)
        total_pages = detected_max or 1
        print(f"Page 1/{total_pages}: {len(books)} books", file=sys.stderr)

        last_page = min(total_pages, max_pages) if max_pages else total_pages
        for page in range(2, last_page + 1):
            time.sleep(SLEEP_BETWEEN_REQUESTS_S)
            html = fetch_page_ajax(client, page)
            books, _ = parse_page(html)
            if not books:
                print(f"Page {page}: empty, stopping", file=sys.stderr)
                break
            all_books.extend(books)
            print(
                f"Page {page}/{total_pages}: {len(books)} books "
                f"(total {len(all_books)})",
                file=sys.stderr,
            )
    return all_books


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Limit number of pages (for dev/testing).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=OUT_PATH,
        help=f"Output JSON path (default: {OUT_PATH}).",
    )
    parser.add_argument(
        "--from-file",
        type=Path,
        default=None,
        help="Parse HTML from a local file instead of fetching (dev).",
    )
    args = parser.parse_args()

    if args.from_file:
        html = args.from_file.read_text()
        books, max_page = parse_page(html)
        print(f"Parsed {len(books)} books, max_page={max_page}", file=sys.stderr)
    else:
        books = scrape(max_pages=args.max_pages)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": BASE_URL,
        "count": len(books),
        "books": books,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {len(books)} books to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
