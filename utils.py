import requests
import datetime
from typing import List, Dict, Any, Optional

# Constants
BASE_URL = "https://dickinson.api.nutrislice.com/menu/api/weeks/school/the-caf/menu-type"
MEAL_TYPES = ["breakfast", "lunch", "dinner"]

def get_nutrislice_url(date: datetime.date, meal_type: str) -> str:
    """
    Generates the dynamic URL for the Nutrislice API based on date and meal type.
    Format: .../menu-type/{meal_type}/{year}/{month}/{day}/
    """
    return f"{BASE_URL}/{meal_type}/{date.year}/{date.month:02d}/{date.day:02d}/"

def fetch_menu_data(date: datetime.date) -> Dict[str, Any]:
    """
    Fetches menu data for all meal types for a given date.
    Returns a dictionary keyed by meal type.
    """
    daily_menu = {}
    
    for meal in MEAL_TYPES:
        url = get_nutrislice_url(date, meal)
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            daily_menu[meal] = data
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {meal} menu for {date}: {e}")
            daily_menu[meal] = None
            
    return daily_menu

# Hardcoded stations as requested
STATIONS = [
    "Deli", "Grill", "Pizza", "Pasta Bar", "Salad Bar", 
    "TexMex", "Ice Cream Toppings", "Soup", "Desserts", "Special Salad Bar", 
    "Fruit Bar", "Sauce Bar", "Island 3", "Main Line", "Gluten Free", "Kove", "Sandwich Toppings"
]

def parse_menu(daily_menu: Dict[str, Any], target_date: Optional[datetime.date] = None) -> List[Dict[str, str]]:
    """
    Parses the raw API response into a flat list of menu items.
    Structure: [{'meal': 'lunch', 'station': 'Grill', 'name': 'Burger', 'description': '...'}, ...]
    
    Args:
        daily_menu: Dictionary of raw API data keyed by meal type.
        target_date: If provided, only parse items for this specific date.
    """
    parsed_items = []
    target_date_str = target_date.strftime("%Y-%m-%d") if target_date else None
    
    for meal_type, data in daily_menu.items():
        if not data:
            continue
            
        days_list = data.get('days', [])
        if not days_list:
            continue
            
        for day in days_list:
            # Filter by date if target_date is provided
            if target_date_str and day.get('date') != target_date_str:
                continue

            menu_items = day.get('menu_items', [])
            current_station = "General"
            
            for item in menu_items:
                # Update current station if this item is a header
                if item.get('is_station_header'):
                    current_station = item.get('text', 'General').title()
                    continue
                
                # Skip non-food items
                food = item.get('food')
                if not food:
                    continue
                
                food_name = food.get('name', 'Unknown')
                
                parsed_items.append({
                    'meal': meal_type,
                    'station': current_station,
                    'name': food_name,
                })
                
    return parsed_items

def get_available_stations(date: datetime.date = None) -> List[str]:
    """
    Returns the hardcoded list of stations.
    """
    return sorted(STATIONS)

if __name__ == "__main__":
    # Quick test
    today = datetime.date.today()
    # For testing, you might want to force a date that likely has data if today is weekend/break
    # today = datetime.date(2026, 1, 27) 
    print(f"Fetching menu for {today}...")
    menu = fetch_menu_data(today)
    parsed = parse_menu(menu, target_date=today)
    print(f"Found {len(parsed)} items for {today}.")
    
    # helper to see what stations are actually found
    found_stations = set(p['station'] for p in parsed)
    print(f"Stations found in data: {found_stations}")

    for p in parsed[:5]:
        print(p)
