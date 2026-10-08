"""Opt-in live RPC check: concurrent clients, no subscriber data or emails.

Requires database/api_rate_limits.sql. Creates two random test counter rows,
which expire and are removed by the normal cleanup job.
"""
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import threading
import uuid

from dotenv import load_dotenv
import requests

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def main():
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/consume_api_limits"
    key = os.environ["SUPABASE_KEY"]
    prefix = "test-concurrency-" + uuid.uuid4().hex
    rules = [
        {"key": prefix + "-hour", "limit": 3, "window_seconds": 3600},
        {"key": prefix + "-cooldown", "limit": 1, "window_seconds": 60},
    ]
    barrier = threading.Barrier(12)

    def call(index):
        barrier.wait(timeout=10)
        # Opposite input orders must still acquire DB locks in stable key order.
        response = requests.post(
            url,
            headers={"apikey": key, "Authorization": "Bearer " + key},
            json={"p_rules": rules if index % 2 else list(reversed(rules))},
            timeout=20,
        )
        assert response.status_code == 200, f"RPC status {response.status_code}"
        return response.json()

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(call, range(12)))
    admitted = sum(result["allowed"] is True for result in results)
    denied = [result for result in results if result["allowed"] is False]
    assert admitted == 1 and len(denied) == 11, "Concurrent cooldown admitted too many requests"
    assert all(1 <= result["retry_after_seconds"] <= 60 for result in denied)
    print("PASS: 12 concurrent clients, one reservation, 11 denials with Retry-After; no emails.")


if __name__ == "__main__":
    main()
