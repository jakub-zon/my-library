# Cycles/series overview — design spec

## Problem

The user's library (`docs/books.json`) has 546 books, 516 of which carry a `cycle`
field (e.g. `"Gorath (tom 3)"`). At the individual-book level it's impossible to
get a sense of how complete/consistent each series is — duplicate entries,
numbering gaps, and inconsistent shelf state across volumes of the same series
are invisible in the flat, per-book table (`index.html`).

Primary goal (near-term): **decluttering** — surface anomalies so the user can
go through series and fix data/shelf inconsistencies.
Secondary goal (long-term, not built now): a high-level browsing view when
picking what to read next.

## Data note

LC's UI may distinguish "cykl" vs "seria" but the scraper (`scraper/scrape.py`)
only ever captures one field: `cycle`, formatted as `"<name> (tom <N>)"` (verified:
0 of 516 cycle values deviate from this pattern; `<N>` can be a decimal like
`0.5` for novellas). This view treats "cycle" and "series" as the same concept.
Books with no `cycle` (30 of 546) are standalone titles and are excluded from
this view.

## Grouping logic

For every book with a `cycle` value:
1. Parse the trailing `(tom <N>)` — extract series name (everything before the
   parenthesis, trimmed) and tom number `N` (float, to support `.5`).
2. Group books by series name.
3. Within a group, sort volumes by tom number ascending for display purposes.

A "cycle group" is: `{ name, authors[], volumes[] }` where each volume is the
original book object plus its parsed `tomNumber`.

## Page: `docs/cycles.html` + `docs/cycles.js`

New standalone script — not built on `list-view.js`, because `list-view.js`'s
`LIST_CONFIG.columns` model has no concept of an expandable sub-table per row.
Instead, `cycles.js` follows the expand/collapse pattern already used in
`app.js` for the main table (`state.expanded: Set`, toggle on chevron click,
re-render), simplified: no text filters, no per-column sort — just the grouping
and expand behavor described here.

### Main row (one per cycle group)

Columns, left to right:

| Chevron | Cover | Cycle name | Author(s) | # volumes | Flags | Shelf breakdown |

- **Chevron**: `▶` button, same `.expand-toggle` styling/behavior as `app.js`.
- **Cover**: cover image of the lowest-`tomNumber` volume in the group. If two
  volumes tie on the lowest tom number (duplicate-tom case), use whichever
  appears first in `books.json`'s original array order — no special
  preference logic.
- **Cycle name**: plain text (not a link — no single-book target makes sense
  here).
- **Author(s)**: union of `authors[]` across all volumes in the group, joined
  with ", " (dedup).
- **# volumes**: count of distinct book entries in the group (e.g. "5 tomów").
- **Flags**: zero or more `⚠` badges (see Flags section), each with a
  `title="…"` tooltip explaining the specific anomaly. Rendered inline, small.
- **Shelf breakdown**: aggregated per-shelf counts across all volumes in the
  group, e.g. `Przeczytane ×3 · Posiadane ×4 · Chcę przeczytać ×1` — a compact
  textual summary, not a flat pill list (a flat list of shelf pills across all
  volumes would just repeat the same 3-4 shelf names with no count signal).
  Shelves ordered alphabetically (`Intl.Collator("pl")`), matching the
  ordering convention already used for the shelf-filter buttons in `app.js`
  (`buildShelfOptions`).

### Expanded row content

On chevron click, insert a detail row containing a small sub-table listing each
volume in tom order:

| Tom | Title (link → `book.html?id=`) | Shelves (pills, existing `.shelf-pill` style) | LC rating | User rating | Read date |

Reuses existing formatting helpers (`escape`, pill rendering, date formatting)
already present in `app.js` / `list-view.js` — copy/adapt rather than share a
module, consistent with how `shelf-page.js` vs `app.js` already duplicate small
amounts of rendering logic rather than sharing one mega-module.

## Flags

Computed once per cycle group at load time. Three independent checks, a group
can carry any combination:

1. **Duplicate tom** (`dup-tom`): two or more distinct book `id`s in the group
   share the same `tomNumber`. Tooltip lists the conflicting titles/shelves
   (e.g. different editions — audiobook vs paper — or an accidental double
   add).
2. **Numbering gap** (`gap`): among the *integer* tom numbers present in the
   group (ignore `.5` fractional entries for this check), there is a missing
   integer between the min and max. E.g. tomes `1, 2, 4` present → gap at `3`.
   Tooltip states the missing number(s).
3. **Shelf mismatch** (`shelf-mismatch`): the set of shelves is not identical
   across all volumes in the group (deliberately broad — will fire on most
   in-progress series; that's expected and accepted, since the current
   priority is exhaustive review, not a curated shortlist). Tooltip is generic
   ("tomy tego cyklu mają różne zestawy półek — rozwiń, by zobaczyć szczegóły").

## Default sort

Cycles with more distinct flag types first (descending flag count), tie-broken
alphabetically by series name (`Intl.Collator("pl")`, matching existing
collator usage). This puts the highest-signal rows at the top for the
decluttering pass. No interactive re-sort/filter for v1 (YAGNI — the long-term
browsing use case is out of scope for this iteration).

## Navigation

Add a `Cykle` link to `.topnav` in every page (`index.html`, `to-check.html`,
`to-read.html`, `reading-plan.html`, `accepted.html`, `rejected.html`,
`cycles.html` itself), positioned between "Biblioteka" and "Do sprawdzenia" —
matching the existing nav order convention (broad library views before
skill-state subpages).

## Update (same day, post-launch)

After shipping, user review of the live page surfaced real edge cases the
original heuristics got wrong (split sub-tomes like "tom 2.1"+"tom 2.2"
falsely triggering the gap flag; a title-split omnibus like "Dziedzictwo.
Tom I"/"Tom II" being indistinguishable from a true duplicate; the
by-design "Niedokończone serie" shelf tripping the shelf-mismatch flag; a
genuine scraper data-completeness bug surfaced by a correct gap flag; and a
`table-layout: auto` column-width bug in the expanded volume table).

Decision: moved grouping + flag computation from `cycles.js` into
`scraper/scrape.py` (`parse_cycle`, `compute_cycle_flags`, `build_cycles`,
`write_cycles`), writing a new `docs/cycles.json` sibling file (alongside
`books.json`/`books-details.json`/`meta.json`) that `cycles.js` now just
fetches and renders — no parsing/interpretation logic left client-side.
Rationale: the anomaly heuristics are non-trivial and iterating on them
benefited from being testable in plain Python against the real dataset;
centralizing in the scraper also means every future consumer of
"cycle-aware" data reads the same precomputed, flagged structure instead of
re-deriving it. Trade-off accepted: updating the heuristic now requires a
scraper change + workflow run to reflect live, vs. an instant JS-only
refresh — acceptable now that the heuristic has been validated against the
full real dataset.

Also corrected: the original claim that "0 of 516 cycle values deviate from
the `(tom N)` pattern" was based on a substring check, not a strict
single-number match — 16 values are actually omnibus ranges like `(tom
1-3)`. The parser (both the retired JS version and the current Python one)
handles this via an optional second number, treating the whole span as
covered for gap detection.

## Out of scope (explicitly not building now)

- Any UI to fix/dedupe the flagged issues (e.g. no way to edit `books.json`
  from the page — data changes still go through the scraper).
- Text filters, column sorting, or shelf-toggle filtering on this page.
- The "high overview for picking what to read next" use case — a future
  iteration once the decluttering pass is done.
