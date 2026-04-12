"use client";

import { startTransition, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [isPending, startNavTransition] = useTransition();
  const [selectedMeal, setSelectedMeal] = useState<Meal>("lunch");

  const visibleMeals = meals.filter((mealGroup) => mealGroup.meal === selectedMeal);

  function navigate(href: string) {
    startNavTransition(() => {
      startTransition(() => {
        router.push(href);
      });
    });
  }

  return (
    <>
      <section className="menu-date-card">
        <div className="menu-nav">
          <button
            type="button"
            className="menu-nav-button prev button-reset"
            aria-label="Previous day"
            onClick={() => navigate(previousHref)}
            disabled={isPending}
          >
            &#x2039;
          </button>
          <h3 className="menu-date-title-centered">{formatDateLabel(date)}</h3>
          <button
            type="button"
            className="menu-nav-button next button-reset"
            aria-label="Next day"
            onClick={() => navigate(nextHref)}
            disabled={isPending}
          >
            &#x203A;
          </button>
        </div>
        {isPending ? (
          <div className="menu-loading-text">
            <span className="menu-inline-spinner" aria-hidden="true" />
            <span>Loading menu...</span>
          </div>
        ) : null}
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
