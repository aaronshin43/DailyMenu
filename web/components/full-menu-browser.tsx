"use client";

import { useState } from "react";
import Link from "next/link";

import { MEALS } from "@/lib/constants";
import type { Meal } from "@/lib/types";
import type { GroupedMealMenu } from "@/lib/menu";

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function FullMenuBrowser({
  date,
  meals,
  previousHref,
  nextHref,
}: {
  date: string;
  meals: GroupedMealMenu[];
  previousHref: string;
  nextHref: string;
}) {
  const [selectedMeal, setSelectedMeal] = useState<Meal>("lunch");

  const visibleMeals = meals.filter((mealGroup) => mealGroup.meal === selectedMeal);

  return (
    <>
      <section className="menu-date-card">
        <div className="menu-nav">
          <Link href={previousHref} className="menu-nav-button" aria-label="Previous day">
            &#x2039;
          </Link>
          <h3 className="menu-date-title-centered">{formatDateLabel(date)}</h3>
          <Link href={nextHref} className="menu-nav-button" aria-label="Next day">
            &#x203A;
          </Link>
        </div>
        <div className="pill-row">
          {MEALS.map((meal) => (
            <button
              key={meal}
              type="button"
              className={`pill-link button-reset${selectedMeal === meal ? " active" : ""}`}
              onClick={() => setSelectedMeal(meal)}
            >
              {meal[0].toUpperCase() + meal.slice(1)}
            </button>
          ))}
        </div>

        {visibleMeals.length === 0 ? (
          <div className="message-box info">
            No menu data is available for this meal selection.
          </div>
        ) : (
          visibleMeals.map((mealGroup) => (
            <div key={mealGroup.meal} className="menu-meal-block">
              <h4 className="menu-meal-title">
                {mealGroup.meal[0].toUpperCase() + mealGroup.meal.slice(1)}
              </h4>
              <div className="menu-station-stack">
                {mealGroup.stations.map((stationGroup) => (
                  <details
                    key={`${mealGroup.meal}-${stationGroup.station}`}
                    className="menu-station-details"
                    open
                  >
                    <summary className="menu-station-summary">
                      <span>{stationGroup.station}</span>
                      <span className="menu-station-chevron" aria-hidden="true">
                        &#x203A;
                      </span>
                    </summary>
                    <div className="menu-card-grid">
                      {stationGroup.items.map((item) => (
                        <article
                          key={`${item.date}-${item.meal}-${item.station}-${item.name}`}
                          className="menu-item-card"
                        >
                          <div className="menu-item-name">{item.name}</div>
                        </article>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
