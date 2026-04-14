import datetime
import os
from typing import Dict, List, Any

from services.utils import MEAL_TYPES, STATION_ORDER


def _get_base_url():
    return (os.getenv("SITE_URL") or "http://localhost:3000").rstrip("/")


def _format_long_date(date_value: datetime.date) -> str:
    return date_value.strftime("%A, %B %d, %Y")


def _format_short_date(date_value: datetime.date) -> str:
    return date_value.strftime("%b %d")


def _chunk_list(items: List[Dict[str, Any]], size: int) -> List[List[Dict[str, Any]]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def _sort_cards(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            item.get("date", ""),
            MEAL_TYPES.index(item["meal"]) if item.get("meal") in MEAL_TYPES else 99,
            STATION_ORDER.get(item.get("station", "").lower(), 999),
            item.get("station", "").lower(),
            item.get("name", "").lower(),
        ),
    )


def _group_items_for_digest(menu_items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]]:
    grouped: Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]] = {}

    for item in _sort_cards(menu_items):
        date_key = item.get("date") or "unknown-date"
        meal_key = item.get("meal", "other").capitalize()
        station_key = item.get("station", "General")
        grouped.setdefault(date_key, {})
        grouped[date_key].setdefault(meal_key, {})
        grouped[date_key][meal_key].setdefault(station_key, [])
        grouped[date_key][meal_key][station_key].append(item)

    return grouped


def _build_card_table(items: List[Dict[str, Any]]) -> str:
    rows_html = []

    for row in _chunk_list(items, 3):
        cells = []
        for item in row:
            cells.append(
                f"""
                <td valign="top" width="33.33%" style="padding: 5px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #ece0d2; border-radius: 12px; background: #fffdfa;">
                        <tr>
                            <td style="padding: 10px 12px; font-size: 15px; line-height: 1.32; color: #231815; font-weight: 600;">
                                {item["name"]}
                            </td>
                        </tr>
                    </table>
                </td>
                """
            )

        while len(cells) < 3:
            cells.append('<td valign="top" width="33.33%" style="padding: 6px;"></td>')

        rows_html.append(f"<tr>{''.join(cells)}</tr>")

    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(rows_html)}</table>'


def _build_station_sections(stations: Dict[str, List[Dict[str, Any]]]) -> str:
    sections = []
    sorted_stations = sorted(
        stations.keys(),
        key=lambda station: (
            STATION_ORDER.get(station.lower(), 999),
            station.lower(),
        ),
    )

    for station in sorted_stations:
        sections.append(
            f"""
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px; border: 1px solid #efe2d4; border-radius: 18px; background: #fffaf4;">
                <tr>
                    <td style="padding: 14px 16px 2px; font-size: 16px; line-height: 1.3; color: #6f1523; font-weight: 700;">
                        {station}
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0 10px 10px;">
                        {_build_card_table(stations[station])}
                    </td>
                </tr>
            </table>
            """
        )

    return "".join(sections)


def generate_confirmation_email(user_email, token):
    """
    Generates a confirmation email with a link to activate the subscription.
    """
    confirm_url = f"{_get_base_url()}/confirm?token={token}"

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
    manage_url = f"{_get_base_url()}/manage?token={token}"

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


def generate_html_email(menu_items: List[Dict[str, Any]], token: str, start_date: datetime.date, days_ahead: int):
    """
    Generates an HTML email body for a 1-2 day filtered digest.
    """
    base_url = _get_base_url()
    manage_url = f"{base_url}/manage?token={token}"
    unsubscribe_url = f"{base_url}/unsubscribe?token={token}"
    full_menu_url = f"{base_url}/menu?date={start_date.isoformat()}"
    grouped = _group_items_for_digest(menu_items)
    end_date = start_date + datetime.timedelta(days=days_ahead - 1)

    full_menu_label = "View full menu"

    date_sections = []
    meal_order = ["Breakfast", "Lunch", "Dinner"]

    for date_key, meals in grouped.items():
        try:
            parsed_date = datetime.date.fromisoformat(date_key)
            date_label = _format_long_date(parsed_date)
        except ValueError:
            date_label = date_key

        meal_sections = []
        for meal in meal_order:
            if meal not in meals:
                continue

            meal_sections.append(
                f"""
                <tr>
                    <td style="padding: 0 22px 18px;">
                        <div style="font-size: 20px; font-weight: 700; color: #8e1f2f; margin-bottom: 10px;">{meal}</div>
                        {_build_station_sections(meals[meal])}
                    </td>
                </tr>
                """
            )

        if meal_sections:
            date_sections.append(
                f"""
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 22px;">
                    <tr>
                        <td valign="middle" style="padding: 6px 8px 12px;">
                            <div style="font-size: 24px; line-height: 1.2; color: #201815; font-weight: 700;">{date_label}</div>
                        </td>
                    </tr>
                    {''.join(meal_sections)}
                </table>
                """
            )

    if not date_sections:
        date_sections.append(
            """
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 22px; border: 1px solid #eedfcf; border-radius: 20px; background: #fffdf8;">
                <tr>
                    <td style="padding: 28px 22px; text-align: center; color: #665e58; font-size: 16px;">
                        No menu items matched your current preferences for this send.
                    </td>
                </tr>
            </table>
            """
        )

    return f"""
    <html>
    <body style="margin: 0; padding: 0; background: #f5ede2; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #231815;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f5ede2; padding: 24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 960px; background: #fff9f1; border: 1px solid #ead8c2; border-radius: 28px; overflow: hidden;">
                        <tr>
                            <td bgcolor="#f7e5d2" style="padding: 24px 28px 16px; background-color: #f7e5d2; border-bottom: 1px solid #ead3ba;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td valign="middle" style="font-size: 16px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8e1f2f;">
                                            Dickinson Daily Menu
                                        </td>
                                        <td align="right" valign="middle">
                                            <a href="{full_menu_url}" style="display: inline-block; min-width: 154px; text-align: center; white-space: nowrap; background: #8e1f2f; color: #fff8f1; text-decoration: none; padding: 10px 18px; border-radius: 999px; font-size: 14px; font-weight: 700;">{full_menu_label}</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 20px 0;">
                                {''.join(date_sections)}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 22px 28px 30px; text-align: center; color: #6d645b; font-size: 13px; line-height: 1.6;">
                                <div>You are receiving this email because you subscribed to Dickinson Daily Menu.</div>
                                <div style="margin-top: 10px;">
                                    <a href="{full_menu_url}" style="color: #8e1f2f; text-decoration: none; font-weight: 700;">View full menu</a>
                                    &nbsp;|&nbsp;
                                    <a href="{manage_url}" style="color: #8e1f2f; text-decoration: none; font-weight: 700;">Manage preferences</a>
                                    &nbsp;|&nbsp;
                                    <a href="{unsubscribe_url}" style="color: #8e1f2f; text-decoration: none; font-weight: 700;">Unsubscribe</a>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
