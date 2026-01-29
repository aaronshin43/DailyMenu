import os
import argparse
import datetime
from typing import List, Dict, Any
from dotenv import load_dotenv
from supabase import create_client, Client

from services.utils import fetch_menu_data, parse_menu, filter_menu_for_user
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

def main():
    parser = argparse.ArgumentParser(description="Send daily menu emails.")
    parser.add_argument("--date", type=str, help="YYYY-MM-DD date to fetch menu for (default: today)")
    parser.add_argument("--email", type=str, help="Send to a specific email address only")
    args = parser.parse_args()

    # 1. Setup Date
    if args.date:
        today = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        today = datetime.date.today()

    logging.info(f"Fetching menu for {today}...")

    # 2. Fetch Menu Data
    raw_data = fetch_menu_data(today)
    all_menu_items = parse_menu(raw_data, target_date=today)
    
    if not all_menu_items:
        logging.warning("No menu items found for today. Exiting.")
        return

    logging.info(f"Found {len(all_menu_items)} total menu items.")

    # 3. Setup Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        logging.error("Supabase credentials missing. Check .env or secrets.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 4. Process Users
    users = get_users(supabase, args.email)
    
    if not users:
        logging.info("No active users found.")
        return

    for user in users:
        email = user["email"]
        token = user.get("token")
        prefs = user.get("preferences", {})
        
        if not token:
             logging.warning(f"User {email} missing token. Skipping.")
             continue

        # Use shared helper for filtering
        filtered_items = filter_menu_for_user(all_menu_items, prefs)
            
        if not filtered_items:
            logging.info(f"Skipping {email}: No items match preferences.")
            continue
            
        # 4. Generate & Send
        html_body = generate_html_email(filtered_items, today.strftime("%A, %B %d, %Y"), token)
        subject = f"Dickinson Daily Menu - {today.strftime('%b %d')}"
        
        logging.info(f"Sending email to {email} with {len(filtered_items)} items...")
        send_email(email, subject, html_body)

if __name__ == "__main__":
    main()
