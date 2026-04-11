"use client";

import { useState } from "react";

import { MEALS, STATION_OPTIONS } from "@/lib/constants";

type SubmitState = {
  tone: "error" | "success" | "info";
  message: string;
} | null;

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

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [meals, setMeals] = useState<string[]>([...MEALS]);
  const [stations, setStations] = useState<string[]>([...STATION_OPTIONS]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitState>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, meals, stations }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        mode?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Subscription failed.");
      }

      setResult({
        tone: payload.mode === "manage-link" ? "info" : "success",
        message: payload.message ?? "Check your inbox for the next step.",
      });
    } catch (error) {
      setResult({
        tone: "error",
        message: error instanceof Error ? error.message : "Subscription failed.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          placeholder="student@dickinson.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="split-grid">
        <div className="field-group">
          <span className="label-text">Meals</span>
          <div className="checkbox-panel">
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
          <div className="checkbox-panel">
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
          {pending ? "Sending..." : "Subscribe"}
        </button>
      </div>
    </form>
  );
}
