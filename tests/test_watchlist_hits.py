"""
Usage:
    python tests/test_watchlist_hits.py --watchlist "cuban pork"

Examples:
    python tests/test_watchlist_hits.py --date 2026-04-13 --watchlist "cuban pork"
    python tests/test_watchlist_hits.py --date 2026-04-13 --days 2 --meal lunch --watchlist "cookie"
    python tests/test_watchlist_hits.py --meal lunch --meal dinner --watchlist "ramen" --watchlist "chicken tender"
"""

import argparse
import datetime
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from services.utils import fetch_menu_data, find_watchlist_hits, parse_menu


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Test watchlist matching without sending email.",
    )
    parser.add_argument(
        "--date",
        help="Start date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--days",
        type=int,
        choices=[1, 2],
        default=1,
        help="How many days to scan",
    )
    parser.add_argument(
        "--meal",
        action="append",
        dest="meals",
        help="Limit matching to a meal type. Repeat for multiple meals.",
    )
    parser.add_argument(
        "--watchlist",
        action="append",
        dest="watchlist",
        required=True,
        help="Saved item term to test. Repeat for multiple terms.",
    )
    return parser.parse_args()


def get_start_date(date_arg: str | None) -> datetime.date:
    if not date_arg:
        return datetime.date.today()

    return datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()


def normalize_watchlist_terms(values: List[str] | None) -> List[str]:
    terms = []
    seen = set()

    for value in values or []:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            continue

        dedupe_key = normalized.lower()
        if dedupe_key in seen:
            continue

        seen.add(dedupe_key)
        terms.append(normalized)

    return terms


def format_hit(item: Dict[str, Any]) -> str:
    date_value = item.get("date", "")
    meal = str(item.get("meal", "")).capitalize()
    station = item.get("station", "General")
    name = item.get("name", "")
    return f"{date_value} | {meal} | {station} | {name}"


def main() -> None:
    args = parse_args()
    start_date = get_start_date(args.date)
    watchlist = normalize_watchlist_terms(args.watchlist)

    all_items: List[Dict[str, Any]] = []
    for offset in range(args.days):
        target_date = start_date + datetime.timedelta(days=offset)
        raw_menu = fetch_menu_data(target_date)
        all_items.extend(parse_menu(raw_menu, target_date=target_date))

    hits = find_watchlist_hits(
        all_items,
        {
            "meals": args.meals or [],
            "watchlist": watchlist,
        },
    )

    print(f"Start date: {start_date.isoformat()}")
    print(f"Days: {args.days}")
    print(f"Meals: {', '.join(args.meals or ['all meals'])}")
    print(f"Watchlist: {', '.join(watchlist)}")
    print(f"Hits: {len(hits)}")

    if not hits:
        return

    print("")
    for item in hits:
        print(format_hit(item))


if __name__ == "__main__":
    main()
