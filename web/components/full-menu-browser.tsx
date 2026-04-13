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
  const [openStations, setOpenStations] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      meals.flatMap((mealGroup) =>
        mealGroup.stations.map((stationGroup) => [
          `${mealGroup.meal}-${stationGroup.station}`,
          true,
        ]),
      ),
    ),
  );

  const visibleMeals = meals.filter((mealGroup) => mealGroup.meal === selectedMeal);

  function navigate(href: string) {
    startNavTransition(() => {
      startTransition(() => {
        router.push(href);
      });
    });
  }

  function toggleStation(key: string) {
    setOpenStations((current) => ({
      ...current,
      [key]: !current[key],
    }));
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
                  (() => {
                    const stationKey = `${mealGroup.meal}-${stationGroup.station}`;
                    const isOpen = openStations[stationKey] ?? true;

                    return (
                      <div
                        key={stationKey}
                        className={`menu-station-details${isOpen ? " is-open" : ""}`}
                      >
                        <button
                          type="button"
                          className="menu-station-summary button-reset-plain"
                          onClick={() => toggleStation(stationKey)}
                          aria-expanded={isOpen}
                        >
                          <span>{stationGroup.station}</span>
                          <span className="menu-station-chevron" aria-hidden="true">
                            &#x203A;
                          </span>
                        </button>
                        <div className="menu-station-panel">
                          <div className="menu-station-panel-inner">
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
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
