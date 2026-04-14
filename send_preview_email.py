"""
Usage:
    python send_preview_email.py --to your@email.com
    
Options:                                                                                                                                                                
    python send_preview_email.py --to your@email.com --date 2026-04-13 --days 2
    python send_preview_email.py --to your@email.com --meal lunch
    python send_preview_email.py --to your@email.com --meal lunch --meal dinner
    python send_preview_email.py --to your@email.com --station "Main Line"
"""

import argparse
import datetime
import logging
from typing import List, Dict, Any

from dotenv import load_dotenv

from services.email_sender import send_email
from services.email_templates import generate_html_email
from services.utils import fetch_menu_data, parse_menu, sort_menu_items

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a preview of the daily menu email to a chosen recipient.",
    )
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--date", help="Start date in YYYY-MM-DD format (default: today)")
    parser.add_argument(
        "--days",
        type=int,
        choices=[1, 2],
        default=1,
        help="How many days to include in the preview email",
    )
    parser.add_argument(
        "--meal",
        action="append",
        dest="meals",
        help="Limit preview to a meal type. Repeat for multiple meals.",
    )
    parser.add_argument(
        "--station",
        action="append",
        dest="stations",
        help="Limit preview to a station. Repeat for multiple stations.",
    )
    return parser.parse_args()


def get_start_date(date_arg: str | None) -> datetime.date:
    if not date_arg:
        return datetime.date.today()

    return datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()


def filter_preview_items(
    menu_items: List[Dict[str, Any]],
    meals: List[str] | None,
    stations: List[str] | None,
) -> List[Dict[str, Any]]:
    meal_filter = {meal.strip().lower() for meal in meals or [] if meal.strip()}
    station_filter = {station.strip().lower() for station in stations or [] if station.strip()}

    filtered_items = []
    for item in menu_items:
        if meal_filter and item.get("meal", "").lower() not in meal_filter:
            continue
        if station_filter and item.get("station", "").lower() not in station_filter:
            continue
        filtered_items.append(item)

    return filtered_items


def main() -> None:
    args = parse_args()
    start_date = get_start_date(args.date)

    all_items: List[Dict[str, Any]] = []
    for offset in range(args.days):
        target_date = start_date + datetime.timedelta(days=offset)
        logging.info("Fetching menu for %s...", target_date)
        raw_menu = fetch_menu_data(target_date)
        parsed_items = parse_menu(raw_menu, target_date=target_date)
        all_items.extend(parsed_items)

    filtered_items = sort_menu_items(filter_preview_items(all_items, args.meals, args.stations))
    html_body = generate_html_email(
        menu_items=filtered_items,
        token="preview-token",
        start_date=start_date,
        days_ahead=args.days,
    )

    if args.days == 1:
        subject = f"[Preview] Dickinson Daily Menu - {start_date.strftime('%b %d')}"
    else:
        end_date = start_date + datetime.timedelta(days=args.days - 1)
        subject = (
            f"[Preview] Dickinson Daily Menu - "
            f"{start_date.strftime('%b %d')} to {end_date.strftime('%b %d')}"
        )

    logging.info(
        "Sending preview email to %s with %s items.",
        args.to,
        len(filtered_items),
    )
    success = send_email(args.to, subject, html_body)

    if not success:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
