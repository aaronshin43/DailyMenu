import os
import argparse
import datetime
from typing import List, Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client

from services.utils import (
    fetch_menu_data,
    parse_menu,
    filter_menu_for_user,
    find_watchlist_hits,
    sort_menu_items,
)
from services.email_templates import generate_html_email
from services.email_sender import send_email

# Load environment variables
load_dotenv()

# Configure Logging
import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_users(supabase: Client, target_email: str = None):
    """Fetch users from Supabase. Optionally filter by a specific email."""
    query = supabase.table("users").select("*").eq("is_active", True)
    
    if target_email:
        # If targeting a specific user, we might want to ignore is_active=True 
        # allowing us to test even with inactive users, or keep it strict.
        # Let's keep it strict for the main script, but log it.
        logging.info(f"Fetching data for specific user: {target_email}")
        query = query.eq("email", target_email)
        
    response = query.execute()
    return response.data

def get_days_ahead(preferences: Dict[str, Any]) -> int:
    try:
        days_ahead = int(preferences.get("days_ahead", 1))
    except (TypeError, ValueError):
        days_ahead = 1

    return max(1, min(days_ahead, 2))

def main():
    parser = argparse.ArgumentParser(description="Send daily menu emails.")
    parser.add_argument("--date", type=str, help="YYYY-MM-DD date to fetch menu for (default: today)")
    parser.add_argument("--email", type=str, help="Send to a specific email address only")
    args = parser.parse_args()

    # 0. Setup Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logging.error("Supabase credentials missing. Check .env or secrets.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Send Heartbeat (Keep-Alive)
    try:
        logging.info("Sending heartbeat to keep_alive table...")
        # Upsert a row with id=1, updating the last_run timestamp
        supabase.table("keep_alive").upsert({"id": 1, "last_run": datetime.datetime.now(datetime.timezone.utc).isoformat()}).execute()
        logging.info("Heartbeat sent successfully.")
    except Exception as e:
        logging.error(f"Failed to send heartbeat: {e}")

    # 2. Setup Date
    if args.date:
        today = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        today = datetime.date.today()

    # 3. Process Users
    users = get_users(supabase, args.email)
    
    if not users:
        logging.info("No active users found.")
        return

    max_days_ahead = max(get_days_ahead(user.get("preferences", {})) for user in users)
    target_dates = [today + datetime.timedelta(days=offset) for offset in range(max_days_ahead)]
    menu_by_date: Dict[datetime.date, List[Dict[str, Any]]] = {}

    for target_date in target_dates:
        logging.info(f"Fetching menu for {target_date}...")
        raw_data = fetch_menu_data(target_date)
        parsed_items = parse_menu(raw_data, target_date=target_date)
        menu_by_date[target_date] = sort_menu_items(parsed_items)
        logging.info(
            "Found %s total menu items for %s.",
            len(menu_by_date[target_date]),
            target_date,
        )

    for user in users:
        email = user["email"]
        token = user.get("token")
        prefs = user.get("preferences", {})
        days_ahead = get_days_ahead(prefs)
        
        if not token:
             logging.warning(f"User {email} missing token. Skipping.")
             continue

        digest_items: List[Dict[str, Any]] = []
        all_items_for_window: List[Dict[str, Any]] = []
        for offset in range(days_ahead):
            target_date = today + datetime.timedelta(days=offset)
            current_date_items = menu_by_date.get(target_date, [])
            all_items_for_window.extend(current_date_items)
            digest_items.extend(filter_menu_for_user(current_date_items, prefs))

        digest_items = sort_menu_items(digest_items)
        watchlist_hits = find_watchlist_hits(all_items_for_window, prefs)
            
        if not digest_items and not watchlist_hits:
            logging.info(
                "Skipping %s: No digest items or watchlist hits across %s day(s).",
                email,
                days_ahead,
            )
            continue
            
        # 4. Generate & Send
        html_body = generate_html_email(
            digest_items,
            token,
            today,
            days_ahead,
            watchlist_hits=watchlist_hits,
        )
        if days_ahead == 1:
            subject = f"Dickinson Daily Menu - {today.strftime('%b %d')}"
        else:
            end_date = today + datetime.timedelta(days=days_ahead - 1)
            subject = f"Dickinson Daily Menu - {today.strftime('%b %d')} to {end_date.strftime('%b %d')}"
        
        logging.info(
            "Sending email to %s with %s digest items and %s watchlist hits across %s day(s)...",
            email,
            len(digest_items),
            len(watchlist_hits),
            days_ahead,
        )
        send_email(email, subject, html_body)

if __name__ == "__main__":
    main()
