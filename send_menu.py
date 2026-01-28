import os
import smtplib
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import datetime
from supabase import create_client, Client
from utils import fetch_menu_data, parse_menu
from email_templates import generate_html_email

# Load environment variables from .env file if present
load_dotenv()

# --- Configuration ---
# Allow environment variables to override for GitHub Actions, otherwise fallback is handled or error.
# For local dev, we might load from .env if we were using python-dotenv, 
# but for simplicity we rely on os.environ being set (or passed in via secrets).

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")

def send_email(to_email, subject, html_content):
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print("Skipping email: SMTP credentials not set.")
        return

    msg = MIMEMultipart()
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
            print(f"Email sent to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")

import argparse

def main():
    parser = argparse.ArgumentParser(description="Send daily menu emails.")
    parser.add_argument("--date", type=str, help="Date to fetch menu for (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Supabase credentials missing.")
        return

    # 1. Fetch Users
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        # Assuming 'users' table exists as per plan
        response = supabase.table("users").select("*").eq("is_active", True).execute()
        users = response.data
    except Exception as e:
        print(f"Error fetching users: {e}")
        return

    if not users:
        print("No active users found.")
        return

    # 2. Fetch Menu
    if args.date:
        try:
            today = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid date format. Use YYYY-MM-DD.")
            return
    else:
        today = datetime.date.today()

    print(f"Fetching menu for {today}...")
    raw_menu = fetch_menu_data(today)
    parsed_menu = parse_menu(raw_menu, target_date=today)
    
    if not parsed_menu:
        print(f"No menu data found for {today}.")
        return

    print(f"Found {len(parsed_menu)} total menu items.")

    # 3. Process Per User
    for user in users:
        email = user["email"]
        prefs = user.get("preferences", {})
        
        # Defaults if preferences are missing/malformed: All meals, All stations (or empty?)
        # Let's assume empty prefs means "everything" or handle gracefully.
        # Based on app.py, we store specific lists.
        
        pref_meals = prefs.get("meals", [])
        pref_stations = prefs.get("stations", [])
        
        # If user explicitly has no preferences set? skip or send all? 
        # Requirement: "Filter the menu items based on the user's stored preferences"
        # If lists are empty, likely means nothing selected -> Send nothing? 
        if not pref_meals:
             print(f"Skipping {email}: No meal preferences selected.")
             continue

        # Filtering Logic
        filtered_items = []
        for item in parsed_menu:
            # Check Meal
            if item["meal"] not in pref_meals:
                continue
                
            # Check Station
            # If pref_stations is empty/Non-existent, maybe they want all stations for that meal?
            # Or strict filtering? "only specific stations".
            # Let's assume if pref_stations has values, we filter. If empty, maybe show all?
            # Re-reading prompt: "only receiving 'Lunch' menus, or only specific stations"
            # Implies AND logic. If stations list is provided, filter by it.
            if pref_stations and item["station"] not in pref_stations:
                continue
                
            filtered_items.append(item)
            
        if not filtered_items:
            print(f"Skipping {email}: No items match preferences.")
            continue
            
        # 4. Generate & Send
        html_body = generate_html_email(filtered_items, today.strftime("%A, %B %d, %Y"))
        subject = f"Dickinson Dining Menu - {today.strftime('%b %d')}"
        
        print(f"Sending email to {email} with {len(filtered_items)} items...")
        send_email(email, subject, html_body)

if __name__ == "__main__":
    main()
