def generate_html_email(menu_items, date_str):
    """
    Generates a clean HTML email body from the filtered menu items.
    menu_items: List of dicts [{'meal': ..., 'station': ..., 'name': ..., 'description': ...}]
    """
    # Group by Meal -> Station
    grouped = {}
    for item in menu_items:
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
            .header {{ background-color: #d32f2f; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }}
            .date {{ font-size: 0.9em; margin-top: 5px; opacity: 0.9; }}
            .meal-section {{ margin-bottom: 30px; border: 1px solid #eee; border-radius: 0 0 5px 5px; padding: 15px; background: #fff; }}
            .meal-title {{ color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 5px; margin-top: 0; }}
            .station-group {{ margin-bottom: 15px; }}
            .station-name {{ font-weight: bold; color: #555; text-transform: uppercase; font-size: 0.8em; margin-bottom: 5px; background: #f5f5f5; padding: 3px 8px; display: inline-block; border-radius: 3px; }}
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
                <h1>Dickinson Dining Daily</h1>
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
                html += f'<div class="station-group"><div class="station-name">{station}</div>'
                for item in grouped[meal][station]:
                    desc = f'<div class="item-desc">{item["description"]}</div>' if item["description"] else ""
                    html += f'<div class="menu-item"><div class="item-name">{item["name"]}</div>{desc}</div>'
                html += '</div>'
            html += '</div>'

    if not has_content:
        html += '<p style="text-align:center; padding: 20px;">No menu items matched your preferences for today.</p>'

    html += """
            <div class="footer">
                <p>You are receiving this email because you subscribed to Dickinson Dining Daily.</p>
                <p><a href="#">Manage Preferences</a> | <a href="#">Unsubscribe</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    return html
