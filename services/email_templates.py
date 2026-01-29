def generate_confirmation_email(user_email, token):
    """
    Generates a confirmation email with a link to activate the subscription.
    """
    BASE_URL = "https://dson-dailymenu.streamlit.app"
    confirm_url = f"{BASE_URL}/?token={token}&action=confirm"
    
    html = f"""
    <html>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
            <h2 style="color: #d32f2f;">Welcome to Dickinson Daily Menu!</h2>
            <p>Please confirm your subscription to start receiving daily menus.</p>
            <div style="margin: 30px 0;">
                <a href="{confirm_url}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Confirm
                </a>
            </div>
            <p style="font-size: 0.9em; color: #666;">If you didn't request this, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """
    return html

def generate_manage_link_email(user_email, token):
    """
    Generates an email with a link to manage preferences for existing users.
    """
    BASE_URL = "https://dson-dailymenu.streamlit.app"
    manage_url = f"{BASE_URL}/?token={token}"
    
    html = f"""
    <html>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
            <h2 style="color: #d32f2f;">Manage Your Preferences</h2>
            <p>You requested a link to manage your Dickinson Daily Menu preferences.</p>
            <div style="margin: 30px 0;">
                <a href="{manage_url}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Update Preferences
                </a>
            </div>
            <p style="font-size: 0.9em; color: #666;">If you didn't request this, consider it a friendly reminder that you are subscribed!</p>
        </div>
    </body>
    </html>
    """
    return html

def generate_html_email(menu_items, date_str, token):
    """
    Generates a clean HTML email body from the filtered menu items.
    menu_items: List of dicts [{'meal': ..., 'station': ..., 'name': ..., 'description': ...}]
    token: The user's unique UUID token for generating secure personal links.
    """
    # Base URL for the Streamlit app
    BASE_URL = "https://dson-dailymenu.streamlit.app"
    
    # Generate Links using TOKEN instead of email
    manage_url = f"{BASE_URL}/?token={token}"
    unsubscribe_url = f"{BASE_URL}/?token={token}&action=unsubscribe"

    # Station Colors (Pastel Palette for eye comfort)
    STATION_COLORS = {
        "Grill": "#FFF3E0",          # Soft Orange
        "Pizza": "#FBE9E7",          # Mist
        "Pasta Bar": "#FFF8E1",      # Pale Yellow
        "Salad Bar": "#E8F5E9",      # Mint Green
        "Special Salad Bar": "#F1F8E9", # Light Lime
        "Fruit Bar": "#F9FBE7",      # Lime Mist
        "Deli": "#EFEBE9",           # Soft Brown
        "Sandwich Toppings": "#F5F5F5", # Grey
        "Soup": "#E0F2F1",           # Soft Teal
        "Desserts": "#FCE4EC",       # Pale Pink
        "Ice Cream Toppings": "#F3E5F5", # Lavender
        "Main Line": "#E3F2FD",      # Pale Blue
        "Island 3": "#E8EAF6",       # Light Indigo
        "Kove": "#E1F5FE",           # Sky Blue
        "Texmex": "#FFEBEE",         # Pale Red
        "Gluten-Free": "#ECEFF1",    # Blue Grey
        "Sauce Bar": "#FAFAFA",      # White Smoke
    }
    DEFAULT_COLOR = "#EEEEEE"

    # Group by Meal -> Station
    grouped = {}
    for item in menu_items:
# ... (grouping logic remains same until HTML generation) ...
        meal = item['meal'].capitalize()
        station = item['station']
        if meal not in grouped:
            grouped[meal] = {}
        if station not in grouped[meal]:
            grouped[meal][station] = []
        grouped[meal][station].append(item)

    # Build HTML
    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #d32f2f; color: white; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }}
            .date {{ font-size: 0.9em; margin-top: 2px; opacity: 0.9; }}
            .meal-section {{ margin-bottom: 30px; border: 1px solid #eee; border-radius: 0 0 5px 5px; padding: 15px; background: #fff; }}
            .meal-title {{ color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 5px; margin-top: 0; }}
            .station-group {{ margin-bottom: 15px; page-break-inside: avoid; }}
            .station-name {{ font-weight: bold; color: #444; text-transform: uppercase; font-size: 0.85em; margin-bottom: 8px; padding: 5px 10px; display: inline-block; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }}
            .menu-item {{ margin-bottom: 8px; padding-left: 10px; border-left: 3px solid #eee; }}
            .item-name {{ font-weight: 600; font-size: 1.05em; }}
            .item-desc {{ font-size: 0.9em; color: #666; font-style: italic; }}
            .footer {{ text-align: center; margin-top: 30px; font-size: 0.8em; color: #999; }}
            a {{ color: #d32f2f; text-decoration: none; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0; font-size: 1.8em;">Daily Menu</h1>
                <div class="date">{date_str}</div>
            </div>
    """

    # Order meals logically
    meal_order = ["Breakfast", "Lunch", "Dinner"]
    
    has_content = False
    for meal in meal_order:
        if meal in grouped:
            has_content = True
            html += f'<div class="meal-section"><h2 class="meal-title">{meal}</h2>'
            
            # Sort stations alphabetically
            sorted_stations = sorted(grouped[meal].keys())
            for station in sorted_stations:
                bg_color = STATION_COLORS.get(station, DEFAULT_COLOR)
                html += f'<div class="station-group"><div class="station-name" style="background-color: {bg_color};">{station}</div>'
                for item in grouped[meal][station]:
                    html += f'<div class="menu-item" style="border-left-color: {bg_color};"><div class="item-name">{item["name"]}</div></div>'
                html += '</div>'
            html += '</div>'

    if not has_content:
        html += '<p style="text-align:center; padding: 20px;">No menu items matched your preferences for today.</p>'

    html += f"""
            <div class="footer">
                <p>You are receiving this email because you subscribed to Dickinson Daily Menu.</p>
                <p><a href="{manage_url}">Manage Preferences</a> | <a href="{unsubscribe_url}">Unsubscribe</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    return html
