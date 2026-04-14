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
    "Main Line", "Island 3", "Soup", "Desserts", "Kove", "Gluten-Free",
    "Grill", "Salad Bar", "Special Salad Bar", "Fruit Bar",
    "Deli", "Sandwich Toppings", "Pizza", "Pasta Bar", "Sauce Bar",  
    "TexMex", "Ice Cream Toppings",
]
STATION_ORDER = {station.lower(): index for index, station in enumerate(STATIONS)}
MEAL_ORDER = {meal: index for index, meal in enumerate(MEAL_TYPES)}

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
                    'date': day.get('date'),
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

def filter_menu_for_user(menu_items: List[Dict], preferences: Dict) -> List[Dict]:
    """
    Filters the menu items based on user preferences.
    """
    user_meals = [m.lower() for m in preferences.get('meals', [])]
    user_stations = [s.lower() for s in preferences.get('stations', [])]
    
    filtered = []
    for item in menu_items:
        # 1. Check Meal Type
        if item['meal'].lower() not in user_meals:
            continue
            
        # 2. Check Station
        # Station matching can be tricky (substrings vs exact). 
        # Our app uses exact strings from the API, so exact match should work.
        if item['station'].lower() not in user_stations:
            continue
            
        filtered.append(item)
        
    return filtered

def get_watchlist_terms(preferences: Dict[str, Any]) -> List[str]:
    """
    Returns normalized watchlist terms from user preferences.
    Matching is case-insensitive and whitespace-normalized.
    """
    raw_watchlist = preferences.get("watchlist", [])
    if not isinstance(raw_watchlist, list):
        return []

    terms = []
    seen = set()

    for item in raw_watchlist:
        if not isinstance(item, str):
            continue

        normalized = " ".join(item.split()).strip().lower()
        if not normalized or normalized in seen:
            continue

        seen.add(normalized)
        terms.append(normalized)

    return terms

def _normalize_word_forms(word: str) -> List[str]:
    normalized = word.strip().lower()
    if not normalized:
        return []

    variants = {normalized}

    if len(normalized) > 3 and normalized.endswith("ies"):
        variants.add(normalized[:-1])
        variants.add(normalized[:-3] + "y")
    elif len(normalized) > 4 and normalized.endswith(("ses", "xes", "zes", "ches", "shes")):
        variants.add(normalized[:-2])
    elif len(normalized) > 3 and normalized.endswith("s") and not normalized.endswith("ss"):
        variants.add(normalized[:-1])

    return [variant for variant in variants if variant]

def _normalize_text_words(value: str) -> set[str]:
    words = set()
    for raw_word in value.split():
        for variant in _normalize_word_forms(raw_word):
            words.add(variant)
    return words

def _term_matches_item_words(term: str, item_words: set[str]) -> bool:
    for term_word in term.split():
        term_variants = _normalize_word_forms(term_word)
        if not term_variants:
            return False

        if not any(variant in item_words for variant in term_variants):
            return False

    return True

def find_watchlist_hits(menu_items: List[Dict], preferences: Dict[str, Any]) -> List[Dict]:
    """
    Finds watchlist matches across all stations while respecting selected meals.
    Returns de-duplicated, sorted menu items that match at least one saved term.
    """
    watchlist_terms = get_watchlist_terms(preferences)
    if not watchlist_terms:
        return []

    user_meals = {
        meal.lower()
        for meal in preferences.get("meals", [])
        if isinstance(meal, str) and meal.strip()
    }

    hits = []
    seen = set()

    for item in menu_items:
        item_meal = item.get("meal", "").lower()
        if user_meals and item_meal not in user_meals:
            continue

        normalized_name = " ".join(str(item.get("name", "")).split()).lower()
        item_words = _normalize_text_words(normalized_name)
        if not item_words:
            continue

        if not any(_term_matches_item_words(term, item_words) for term in watchlist_terms):
            continue

        item_key = (
            item.get("date", ""),
            item.get("meal", ""),
            item.get("station", ""),
            item.get("name", ""),
        )
        if item_key in seen:
            continue

        seen.add(item_key)
        hits.append(item)

    return sort_menu_items(hits)

def sort_menu_items(menu_items: List[Dict]) -> List[Dict]:
    """
    Sort menu items by date, meal order, station order, then item name.
    """
    return sorted(
        menu_items,
        key=lambda item: (
            item.get('date', ''),
            MEAL_ORDER.get(item.get('meal', '').lower(), 99),
            STATION_ORDER.get(item.get('station', '').lower(), 999),
            item.get('station', '').lower(),
            item.get('name', '').lower(),
        ),
    )

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
