"""Opt-in live check using one synthetic subscriber, deleted in finally; no SMTP.

Without --base-url checks the server RPCs directly. With a localhost Next.js
server also verifies confirmation/manage/unsubscribe HTTP behavior and races.
Only the randomly named @example.invalid fixture is ever read or changed.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import threading
from urllib.parse import urlparse
import uuid

from dotenv import load_dotenv
import requests

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Local Next.js server, e.g. http://127.0.0.1:3001")
    args = parser.parse_args()
    base = args.base_url.rstrip("/") if args.base_url else None
    if base:
        parsed = urlparse(base)
        assert parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1"), "Use a local test server"
        assert not parsed.username and not parsed.password and parsed.path in ("", "/")

    rest = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = os.environ["SUPABASE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    email = "confirmation-live-test-" + uuid.uuid4().hex + "@example.invalid"
    prefs = {"meals": ["lunch"], "stations": [], "days_ahead": 2, "watchlist": ["ramen"]}

    def rpc(name, body):
        response = requests.post(rest + "/rpc/" + name, headers=headers, json=body, timeout=20)
        assert response.status_code == 200, f"RPC {name}: status {response.status_code}"
        return response.json()

    def patch(body):
        response = requests.patch(rest + "/users", params={"email": "eq." + email},
                                  headers=headers, json=body, timeout=20)
        assert response.status_code == 204, f"Fixture patch: status {response.status_code}"

    def confirm(token, valid):
        if not base:
            result = rpc("confirm_menu_subscription", {"p_token": token})
            assert bool(result) == valid, "Unexpected confirmation admission"
            if valid:
                assert len(result) == 1 and result[0]["is_active"] is True
            return
        response = requests.post(base + "/api/confirm", json={"token": token}, timeout=20)
        assert response.status_code == (200 if valid else 410), f"Confirm: status {response.status_code}"
        assert response.headers.get("cache-control") == "no-store"
        result = response.json()
        assert "token" not in result and "confirmation_token" not in result

    def read_fixture():
        response = requests.get(rest + "/users", params={"email": "eq." + email,
            "select": "token,is_active,confirmation_token,confirmation_expires_at,preferences"},
            headers=headers, timeout=20)
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        return rows[0]

    def unsubscribe(token):
        if not base:
            patch({"is_active": False})
            return
        response = requests.post(base + "/api/unsubscribe", json={"token": token}, timeout=20)
        assert response.status_code == 200, f"Unsubscribe: status {response.status_code}"

    def concurrent(actions):
        barrier = threading.Barrier(len(actions))

        def run(action):
            barrier.wait(timeout=10)
            action()

        with ThreadPoolExecutor(max_workers=len(actions)) as pool:
            list(pool.map(run, actions))

    try:
        pending = rpc("prepare_menu_subscription", {"p_email": email, "p_preferences": prefs})[0]
        manage = pending["token"]
        first = pending["confirmation_token"]
        assert pending["is_active"] is False and first != manage
        confirm(manage, False)
        replacement = rpc("prepare_menu_subscription", {"p_email": email, "p_preferences": prefs})[0]
        current = replacement["confirmation_token"]
        assert replacement["token"] == manage and current != first
        confirm(first, False)

        concurrent([lambda: confirm(current, True)] * 8)
        assert read_fixture()["is_active"] is True
        active = rpc("prepare_menu_subscription", {"p_email": email, "p_preferences": {}})[0]
        assert active["is_active"] is True and active["token"] == manage
        assert active["confirmation_token"] == current and active["preferences"] == prefs

        if base:
            for value, expected in [(manage, 200), (current, 404)]:
                response = requests.get(base + "/api/preferences", params={"token": value}, timeout=20)
                assert response.status_code == expected
                assert "confirmation_token" not in response.json()
            response = requests.post(base + "/api/unsubscribe", json={"token": current}, timeout=20)
            assert response.status_code == 404 and read_fixture()["is_active"] is True
            response = requests.post(base + "/api/preferences", json={"token": manage, **prefs}, timeout=20)
            assert response.status_code == 200

        # Whichever statement wins the row lock, final state must be inactive.
        # Racing confirmations can either succeed before unsubscribe or be denied after it.
        def racing_confirm():
            if base:
                response = requests.post(base + "/api/confirm", json={"token": current}, timeout=20)
                assert response.status_code in (200, 410)
            else:
                rpc("confirm_menu_subscription", {"p_token": current})

        concurrent([racing_confirm] * 4 + [lambda: unsubscribe(manage)])
        after = read_fixture()
        assert after["is_active"] is False and after["confirmation_token"] is None
        assert after["confirmation_expires_at"] is None and after["token"] == manage
        confirm(current, False)

        renewed = rpc("prepare_menu_subscription", {"p_email": email, "p_preferences": prefs})[0]
        assert renewed["token"] == manage and renewed["is_active"] is False
        renewed_token = renewed["confirmation_token"]
        assert renewed_token != current
        patch({"confirmation_expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()})
        confirm(renewed_token, False)
        assert read_fixture()["is_active"] is False

        pending = rpc("prepare_menu_subscription", {"p_email": email, "p_preferences": prefs})[0]
        unsubscribe(manage)
        confirm(pending["confirmation_token"], False)
        print("PASS: token separation, resend, 8 concurrent confirmations, unsubscribe race, expiry, pending revocation; no emails.")
    finally:
        response = requests.delete(rest + "/users", params={"email": "eq." + email},
                                   headers=headers, timeout=20)
        assert response.status_code == 204, f"Synthetic fixture cleanup: status {response.status_code}"
        print("Synthetic subscriber removed.")


if __name__ == "__main__":
    main()
