"""Offline checks for cafeteria dates, DST, and sender failure reporting."""
import datetime
import os
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import send_menu
from services.email_sender import send_email


class DeliveryScheduleTests(unittest.TestCase):
    def test_default_date_uses_new_york_at_utc_midnight(self):
        for instant in (
            datetime.datetime(2026, 1, 15, 2, tzinfo=datetime.timezone.utc),
            datetime.datetime(2026, 7, 15, 2, tzinfo=datetime.timezone.utc),
        ):
            with self.subTest(instant=instant), patch.object(send_menu.datetime, "datetime") as clock:
                clock.now.return_value = instant.astimezone(send_menu.MENU_TIMEZONE)
                self.assertEqual(send_menu.get_menu_date(), instant.date() - datetime.timedelta(days=1))
                clock.now.assert_called_once_with(send_menu.MENU_TIMEZONE)

    def test_dispatch_date_overrides_runner_date(self):
        self.assertEqual(send_menu.get_menu_date("2026-10-08"), datetime.date(2026, 10, 8))

    def test_invalid_date_is_rejected(self):
        for value in ("2026-02-30", "not-a-date"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                send_menu.get_menu_date(value)

    def test_cron_dispatches_at_seven_once_every_day_including_dst(self):
        sql = (Path(__file__).resolve().parents[1] / "database/daily_menu_cron.sql").read_text()
        cron = re.search(r"'daily-menu-7am-new-york',\s*'([^']+)'", sql).group(1)
        minute, hours, *_ = cron.split()
        timezone = ZoneInfo(re.search(r"at time zone '([^']+)'", sql).group(1))
        start = datetime.date(2026, 1, 1)
        for offset in range(365):
            day = start + datetime.timedelta(days=offset)
            dispatches = []
            for hour in hours.split(","):
                instant = datetime.datetime.combine(
                    day, datetime.time(int(hour), int(minute)), tzinfo=datetime.timezone.utc
                ).astimezone(timezone)
                if datetime.time(7) <= instant.time() < datetime.time(7, 5):
                    dispatches.append(instant)
            with self.subTest(day=day):
                self.assertEqual(len(dispatches), 1)
                self.assertEqual(dispatches[0].date(), day)
                self.assertEqual(dispatches[0].time(), datetime.time(7))

    def test_missing_credentials_fails_before_network_access(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "", "SUPABASE_KEY": ""}), \
             patch.object(sys, "argv", ["send_menu.py"]), \
             patch.object(send_menu, "create_client") as client, \
             self.assertRaises(SystemExit) as error:
            send_menu.main()
        self.assertEqual(error.exception.code, 1)
        client.assert_not_called()

    def test_smtp_failure_marks_batch_failed_and_continues_other_recipients(self):
        users = [
            {"email": email, "token": "test-token", "preferences": {
                "meals": ["lunch"], "stations": ["Grill"], "days_ahead": 1,
            }} for email in ("first@example.com", "second@example.com")
        ]
        item = {"date": "2026-10-08", "meal": "lunch", "station": "Grill", "name": "Burger"}
        with patch.dict(os.environ, {"SUPABASE_URL": "https://example.com", "SUPABASE_KEY": "test"}), \
             patch.object(sys, "argv", ["send_menu.py", "--date", "2026-10-08"]), \
             patch.object(send_menu, "create_client"), \
             patch.object(send_menu, "get_users", return_value=users), \
             patch.object(send_menu, "fetch_menu_data", return_value={}), \
             patch.object(send_menu, "parse_menu", return_value=[item]), \
             patch.object(send_menu, "generate_html_email", return_value="<p>menu</p>"), \
             patch.object(send_menu, "send_email", side_effect=[False, True]) as mail, \
             self.assertRaises(SystemExit) as error:
            send_menu.main()
        self.assertEqual(error.exception.code, 1)
        self.assertEqual(mail.call_count, 2)

    def test_smtp_connection_has_timeout(self):
        with patch.dict(os.environ, {
            "SMTP_EMAIL": "sender@example.com", "SMTP_PASSWORD": "test",
            "SMTP_SERVER": "smtp.example.com", "SMTP_PORT": "587",
        }), patch("services.email_sender.smtplib.SMTP") as smtp:
            self.assertTrue(send_email("recipient@example.com", "Menu", "<p>menu</p>"))
        smtp.assert_called_once_with("smtp.example.com", 587, timeout=30)
        smtp.return_value.__enter__.return_value.sendmail.assert_called_once()

    def test_database_check_reads_zero_rows_and_does_not_send_or_write(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "https://example.com", "SUPABASE_KEY": "test"}), \
             patch.object(sys, "argv", ["send_menu.py", "--check-db-access"]), \
             patch.object(send_menu, "create_client") as client, \
             patch.object(send_menu, "get_users") as users, \
             patch.object(send_menu, "send_email") as mail:
            send_menu.main()
        database = client.return_value
        self.assertEqual([call.args[0] for call in database.table.call_args_list], ["users", "keep_alive"])
        self.assertEqual(database.table.return_value.select.call_count, 2)
        database.table.return_value.select.assert_called_with("*", head=True)
        database.table.return_value.select.return_value.limit.assert_called_with(0)
        database.table.return_value.upsert.assert_not_called()
        users.assert_not_called()
        mail.assert_not_called()

    def test_database_check_propagates_permission_failure(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "https://example.com", "SUPABASE_KEY": "test"}), \
             patch.object(sys, "argv", ["send_menu.py", "--check-db-access"]), \
             patch.object(send_menu, "create_client") as client, \
             patch.object(send_menu, "send_email") as mail:
            client.return_value.table.return_value.select.return_value.limit.return_value.execute.side_effect = PermissionError("denied")
            with self.assertRaises(PermissionError):
                send_menu.main()
        mail.assert_not_called()


if __name__ == "__main__":
    unittest.main()
