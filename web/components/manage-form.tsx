"use client";

import { useEffect, useState } from "react";

import { DAYS_AHEAD_OPTIONS, MEALS, STATION_OPTIONS } from "@/lib/constants";

type LoadState = "loading" | "ready" | "error";

type SubmitState = {
  tone: "error" | "success" | "info";
  message: string;
} | null;

type PreferencesPayload = {
  email: string;
  isActive: boolean;
  preferences: {
    meals: string[];
    stations: string[];
    days_ahead: 1 | 2;
    watchlist: string[];
  };
};

function toggleArrayValue(
  current: string[],
  value: string,
  checked: boolean,
): string[] {
  if (checked) {
    return [...current, value];
  }

  return current.filter((item) => item !== value);
}

function parseWatchlist(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function ManageForm({ token }: { token: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [meals, setMeals] = useState<string[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [daysAhead, setDaysAhead] = useState<1 | 2>(1);
  const [watchlistText, setWatchlistText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitState>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch(
          `/api/preferences?token=${encodeURIComponent(token)}`,
        );
        const payload = (await response.json()) as
          | PreferencesPayload
          | { error?: string };

        if (!response.ok || !("preferences" in payload)) {
          throw new Error(
            "error" in payload ? payload.error ?? "Unable to load preferences." : "Unable to load preferences.",
          );
        }

        if (!cancelled) {
          setEmail(payload.email);
          setIsActive(payload.isActive);
          setMeals(payload.preferences.meals);
          setStations(payload.preferences.stations);
          setDaysAhead(payload.preferences.days_ahead ?? 1);
          setWatchlistText((payload.preferences.watchlist ?? []).join("\n"));
          setLoadState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            tone: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load preferences.",
          });
          setLoadState("error");
        }
      }
    }

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          meals,
          stations,
          days_ahead: daysAhead,
          watchlist: parseWatchlist(watchlistText),
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update preferences.");
      }

      setResult({
        tone: "success",
        message: payload.message ?? "Preferences updated successfully.",
      });
    } catch (error) {
      setResult({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update preferences.",
      });
    } finally {
      setPending(false);
    }
  }

  if (loadState === "loading") {
    return <div className="message-box info">Loading your preferences...</div>;
  }

  if (loadState === "error") {
    return (
      <div className="message-box error">
        {result?.message ?? "This manage link is invalid."}
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="message-box info">
        Managing preferences for <strong>{email}</strong>
        {isActive ? "" : ". This subscription is currently inactive."}
      </div>

      <div className="field-group">
        <label htmlFor="manage_days_ahead">Menu range in each email</label>
        <select
          id="manage_days_ahead"
          className="input"
          value={daysAhead}
          onChange={(event) => setDaysAhead(Number(event.target.value) as 1 | 2)}
        >
          {DAYS_AHEAD_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} day{option === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="manage_watchlist">Watchlist</label>
        <textarea
          id="manage_watchlist"
          className="input textarea-input"
          placeholder={"Ramen\nChicken tenders\nChocolate cake"}
          value={watchlistText}
          onChange={(event) => setWatchlistText(event.target.value)}
          rows={4}
        />
        <div className="field-hint">
          Watchlists are checked across all stations.
        </div>
      </div>

      <div className="split-grid">
        <div className="field-group">
          <span className="label-text">Meals</span>
          <div className="checkbox-panel checkbox-panel-tall">
            <div className="checkbox-list">
              {MEALS.map((meal) => (
                <label key={meal} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={meals.includes(meal)}
                    onChange={(event) =>
                      setMeals(
                        toggleArrayValue(meals, meal, event.target.checked),
                      )
                    }
                  />
                  <span>{meal[0].toUpperCase() + meal.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="field-group">
          <span className="label-text">Stations</span>
          <div className="checkbox-panel checkbox-panel-tall">
            <div className="panel-actions">
              <button
                type="button"
                className="panel-action-button"
                onClick={() => setStations([...STATION_OPTIONS])}
              >
                Select all
              </button>
              <button
                type="button"
                className="panel-action-button"
                onClick={() => setStations([])}
              >
                Remove all
              </button>
            </div>
            <div className="checkbox-list">
              {STATION_OPTIONS.map((station) => (
                <label key={station} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={stations.includes(station)}
                    onChange={(event) =>
                      setStations(
                        toggleArrayValue(
                          stations,
                          station,
                          event.target.checked,
                        ),
                      )
                    }
                  />
                  <span>{station}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {result ? (
        <div className={`message-box ${result.tone}`}>{result.message}</div>
      ) : null}

      <div className="button-row">
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Update Preferences"}
        </button>
      </div>
    </form>
  );
}
