"""Scrape user's book collection from lubimyczytac.pl into data/books.json."""

from __future__ import annotations

import argparse
import json
import os
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
OUT_PATH = REPO_ROOT / "docs" / "books.json"
DETAILS_PATH = REPO_ROOT / "docs" / "books-details.json"

# Enrichment tunables
SLEEP_DETAIL_S = 1.5
MAX_RETRIES = 5
BACKOFF_START_S = 5
BACKOFF_MAX_S = 80
RATE_LIMIT_SLEEP_S = 60


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


def extract_details(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    details: dict = {"description": None, "genre": None, "pages": None}

    desc_el = soup.select_one("#book-description")
    if desc_el:
        for br in desc_el.find_all("br"):
            br.replace_with("\n")
        text = desc_el.get_text().strip()
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        details["description"] = text or None

    dl = soup.select_one("#book-details dl")
    if dl:
        for dt in dl.find_all("dt"):
            label = dt.get_text(strip=True).rstrip(":").strip()
            dd = dt.find_next_sibling("dd")
            if not dd:
                continue
            value = dd.get_text(" ", strip=True)
            if label == "Kategoria":
                details["genre"] = value or None
            elif label == "Liczba stron":
                digits = re.sub(r"\D+", "", value)
                details["pages"] = int(digits) if digits else None
    return details


def _load_details() -> dict:
    if DETAILS_PATH.exists():
        try:
            return json.loads(DETAILS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("Warning: books-details.json is corrupt, starting fresh.", file=sys.stderr)
    return {}


def _save_details(data: dict) -> None:
    DETAILS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DETAILS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def _needs_enrichment(entry: dict | None, refresh: bool) -> bool:
    if refresh:
        return True
    if entry is None:
        return True
    if entry.get("error") == "404":
        return False  # permanent, don't retry
    if entry.get("error") == "parse":
        return True  # transient, retry next run
    has_data = bool(entry.get("description") or entry.get("genre") or entry.get("pages"))
    return not has_data


def _fetch_detail_once(client: httpx.Client, url: str) -> tuple[str, int, str]:
    r = client.get(url, headers=HEADERS, timeout=30.0)
    return r.text, r.status_code, ""


def enrich_one(client: httpx.Client, book: dict) -> tuple[dict, str]:
    """Fetch and parse a single book's detail page with retries.

    Returns (details_dict, outcome) where outcome is one of:
    ok | retry-ok | http-404 | parse-err | transport-err
    """
    url = book.get("url") or ""
    if not url:
        return ({"description": None, "genre": None, "pages": None, "error": "no-url"}, "parse-err")

    backoff = BACKOFF_START_S
    last_err: str | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = client.get(url, headers=HEADERS, timeout=30.0)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last_err = f"transport:{type(e).__name__}"
            print(f"    attempt {attempt}: {last_err}, sleeping {backoff}s", file=sys.stderr)
            time.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX_S)
            continue

        if r.status_code == 404:
            return (
                {"description": None, "genre": None, "pages": None, "error": "404"},
                "http-404",
            )
        if r.status_code == 429:
            print(f"    attempt {attempt}: 429 rate-limited, sleeping {RATE_LIMIT_SLEEP_S}s", file=sys.stderr)
            time.sleep(RATE_LIMIT_SLEEP_S)
            continue  # does not advance retry counter meaningfully; loop continues
        if r.status_code != 200:
            last_err = f"http-{r.status_code}"
            print(f"    attempt {attempt}: HTTP {r.status_code}, sleeping {backoff}s", file=sys.stderr)
            time.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX_S)
            continue

        try:
            details = extract_details(r.text)
        except Exception as e:  # noqa: BLE001
            last_err = f"parse:{type(e).__name__}"
            if attempt < MAX_RETRIES:
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_S)
                continue
            return (
                {"description": None, "genre": None, "pages": None, "error": "parse"},
                "parse-err",
            )

        if not any([details["description"], details["genre"], details["pages"]]):
            # All three empty → likely a parse/page-layout issue, retry
            if attempt < MAX_RETRIES:
                print(f"    attempt {attempt}: empty parse, sleeping {backoff}s", file=sys.stderr)
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_S)
                continue
            return (
                {"description": None, "genre": None, "pages": None, "error": "parse"},
                "parse-err",
            )

        return (details, "ok" if attempt == 1 else "retry-ok")

    return (
        {"description": None, "genre": None, "pages": None, "error": last_err or "retries-exhausted"},
        "parse-err",
    )


def enrich_books(
    books: list[dict],
    limit: int | None = None,
    refresh: bool = False,
) -> tuple[dict, list[dict]]:
    existing = _load_details()
    stats = {
        "total_in_library": len(books),
        "skipped_already_done": 0,
        "ok_first": 0,
        "retried_ok": 0,
        "http_404": 0,
        "parse_err": 0,
    }
    failures: list[dict] = []

    to_process: list[dict] = []
    for b in books:
        book_id = str(b.get("id") or "")
        if not book_id:
            continue
        entry = existing.get(book_id)
        if not _needs_enrichment(entry, refresh):
            stats["skipped_already_done"] += 1
            continue
        to_process.append(b)

    if limit is not None:
        to_process = to_process[:limit]

    total = len(to_process)
    print(
        f"Enrichment: {total} books to fetch "
        f"(skipping {stats['skipped_already_done']} already complete)",
        file=sys.stderr,
    )

    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        for i, b in enumerate(to_process, 1):
            book_id = str(b["id"])
            title = (b.get("title") or "")[:60]
            print(f"  [{i}/{total}] id={book_id} {title}", file=sys.stderr)
            result, outcome = enrich_one(client, b)
            existing[book_id] = result
            if outcome == "ok":
                stats["ok_first"] += 1
            elif outcome == "retry-ok":
                stats["retried_ok"] += 1
            elif outcome == "http-404":
                stats["http_404"] += 1
                failures.append({
                    "id": book_id,
                    "title": b.get("title") or "",
                    "author": ", ".join(b.get("authors") or []),
                    "error": "404",
                })
            else:
                stats["parse_err"] += 1
                failures.append({
                    "id": book_id,
                    "title": b.get("title") or "",
                    "author": ", ".join(b.get("authors") or []),
                    "error": result.get("error") or "parse",
                })
            time.sleep(SLEEP_DETAIL_S)

    _save_details(existing)
    return stats, failures


def _format_duration(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes}m {secs:02d}s"


def write_summary(
    stats: dict,
    failures: list[dict],
    duration_s: float,
    library_new_books: int | None = None,
) -> str:
    lines = ["## 📚 Library scrape summary", ""]
    lib_line = f"**Listing:** {stats['total_in_library']} books"
    if library_new_books is not None and library_new_books > 0:
        lib_line += f" (+{library_new_books} new since last run)"
    lines.append(lib_line)
    lines.append("")
    lines.append("### Detail enrichment")
    lines.append("| outcome | count |")
    lines.append("|---|---:|")
    lines.append(f"| ✅ enriched OK (first try) | {stats['ok_first']} |")
    lines.append(f"| 🔄 retried & succeeded | {stats['retried_ok']} |")
    lines.append(f"| ⏭️ skipped (already had data) | {stats['skipped_already_done']} |")
    lines.append(f"| ❌ permanent 404 | {stats['http_404']} |")
    lines.append(f"| ⚠️ parse error | {stats['parse_err']} |")
    lines.append("")
    if failures:
        lines.append("### Failures")
        lines.append("| ID | Title | Author | Error |")
        lines.append("|---|---|---|---|")
        for f in failures:
            lines.append(f"| {f['id']} | {f['title']} | {f['author']} | {f['error']} |")
        lines.append("")
    lines.append(f"**Total time:** {_format_duration(duration_s)}")
    md = "\n".join(lines) + "\n"

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as fh:
                fh.write(md)
        except OSError as e:
            print(f"Warning: cannot write GITHUB_STEP_SUMMARY: {e}", file=sys.stderr)

    print("\n" + md, file=sys.stderr)
    return md


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
    parser.add_argument(
        "--no-enrich",
        action="store_true",
        help="Skip the detail-page enrichment pass.",
    )
    parser.add_argument(
        "--refresh-details",
        action="store_true",
        help="Re-fetch every book's detail page, ignoring existing books-details.json.",
    )
    parser.add_argument(
        "--enrich-limit",
        type=int,
        default=None,
        help="For smoke-testing: only enrich the first N books needing it.",
    )
    args = parser.parse_args()

    t_start = time.monotonic()

    previous_count = 0
    if args.out.exists():
        try:
            previous_count = len(json.loads(args.out.read_text()).get("books", []))
        except (json.JSONDecodeError, OSError):
            previous_count = 0

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

    if args.no_enrich or args.from_file:
        print("Enrichment skipped.", file=sys.stderr)
        return

    stats, failures = enrich_books(
        books,
        limit=args.enrich_limit,
        refresh=args.refresh_details,
    )
    duration = time.monotonic() - t_start
    new_books = max(0, len(books) - previous_count) if previous_count else 0
    write_summary(stats, failures, duration, library_new_books=new_books)


if __name__ == "__main__":
    main()
