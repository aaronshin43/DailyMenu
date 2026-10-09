"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { MEALS } from "@/lib/constants";
import type { Meal, MenuItem } from "@/lib/types";
import type { GroupedMealMenu } from "@/lib/menu";

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

const NUTRITION_ROWS: Array<{
  label: string;
  key: keyof NonNullable<MenuItem["nutritionInfo"]>;
  unit: string;
  indent?: boolean;
  strong?: boolean;
}> = [
  { label: "Total Fat", key: "g_fat", unit: "g", strong: true },
  { label: "Saturated Fat", key: "g_saturated_fat", unit: "g", indent: true },
  { label: "Trans Fat", key: "g_trans_fat", unit: "g", indent: true },
  { label: "Cholesterol", key: "mg_cholesterol", unit: "mg", strong: true },
  { label: "Sodium", key: "mg_sodium", unit: "mg", strong: true },
  { label: "Total Carbohydrate", key: "g_carbs", unit: "g", strong: true },
  { label: "Dietary Fiber", key: "g_fiber", unit: "g", indent: true },
  { label: "Total Sugars", key: "g_sugar", unit: "g", indent: true },
  { label: "Added Sugars", key: "g_added_sugar", unit: "g", indent: true },
  { label: "Protein", key: "g_protein", unit: "g", strong: true },
  { label: "Calcium", key: "mg_calcium", unit: "mg" },
  { label: "Iron", key: "mg_iron", unit: "mg" },
  { label: "Potassium", key: "mg_potassium", unit: "mg" },
  { label: "Vitamin C", key: "mg_vitamin_c", unit: "mg" },
  { label: "Vitamin D", key: "mg_vitamin_d", unit: "mg" },
];

function formatNutritionValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function hasNumericValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMaybeNutritionValue(value: unknown): string {
  if (!hasNumericValue(value)) {
    return "0";
  }

  return formatNutritionValue(value);
}

function formatCalories(value: number | null | undefined): string | null {
  if (!hasNumericValue(value)) {
    return null;
  }

  return `${formatNutritionValue(value)} cal`;
}

function getItemKey(item: MenuItem): string {
  return `${item.date}-${item.meal}-${item.station}-${item.name}`;
}

export function FullMenuBrowser({
  date,
  meals,
  previousHref,
  nextHref,
  subscribeHref,
}: {
  date: string;
  meals: GroupedMealMenu[];
  previousHref: string;
  nextHref: string;
  subscribeHref?: string;
}) {
  const router = useRouter();
  const [isPending, startNavTransition] = useTransition();
  const [selectedMeal, setSelectedMeal] = useState<Meal>("lunch");
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const itemTriggerRef = useRef<HTMLButtonElement>(null);
  const backdropPointerDownRef = useRef(false);
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
  const visibleItems = useMemo(
    () =>
      visibleMeals.flatMap((mealGroup) =>
        mealGroup.stations.flatMap((stationGroup) => stationGroup.items),
      ),
    [visibleMeals],
  );
  const selectedItem =
    selectedItemKey === null
      ? null
      : visibleItems.find((item) => getItemKey(item) === selectedItemKey) ?? null;
  const isItemModalOpen = selectedItem !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isItemModalOpen || !dialog) return;

    const trigger = itemTriggerRef.current;
    const { scrollX, scrollY } = window;
    const body = document.body;
    const root = document.documentElement;
    const properties = ["position", "top", "left", "width", "overflow", "padding-right"];
    const previousBody = properties.map((property) => ({ property,
      value: body.style.getPropertyValue(property), priority: body.style.getPropertyPriority(property) }));
    const previousOverflow = root.style.getPropertyValue("overflow");
    const previousOverflowPriority = root.style.getPropertyPriority("overflow");
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const paddingRight = getComputedStyle(body).paddingRight;

    // Fixed positioning also stops background touch scrolling on iOS Safari.
    // Preserve the original offset and styles for close, navigation and unmount.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `calc(${paddingRight} + ${scrollbarWidth}px)`;
    root.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      for (const { property, value, priority } of previousBody) {
        body.style.setProperty(property, value, priority);
      }
      root.style.setProperty("overflow", previousOverflow, previousOverflowPriority);
      // Restore immediately even when the page normally uses smooth scrolling.
      const previousBehavior = root.style.getPropertyValue("scroll-behavior");
      const previousBehaviorPriority = root.style.getPropertyPriority("scroll-behavior");
      root.style.setProperty("scroll-behavior", "auto", "important");
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
      root.style.setProperty("scroll-behavior", previousBehavior, previousBehaviorPriority);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isItemModalOpen]);

  useEffect(() => {
    void router.prefetch(previousHref);
    void router.prefetch(nextHref);
  }, [nextHref, previousHref, router]);

  useEffect(() => {
    if (!selectedItemKey) {
      return;
    }

    if (!visibleItems.some((item) => getItemKey(item) === selectedItemKey)) {
      setSelectedItemKey(null);
    }
  }, [selectedItemKey, visibleItems]);

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

  function closeItemModal() {
    setSelectedItemKey(null);
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
        <div className="menu-filter-row">
          <div className="pill-row menu-pill-row">
            {MEALS.map((meal) => (
              <button
                key={meal}
                type="button"
                className={`pill-link button-reset${selectedMeal === meal ? " active" : ""}`}
                aria-pressed={selectedMeal === meal}
                onClick={() => setSelectedMeal(meal)}
              >
                {meal[0].toUpperCase() + meal.slice(1)}
              </button>
            ))}
          </div>
          {subscribeHref ? (
            <div className="menu-utility-row">
              <Link href={subscribeHref} className="menu-secondary-link">
                Subscribe
              </Link>
            </div>
          ) : null}
        </div>

        {visibleMeals.length === 0 ? (
          <div className="message-box info">
            No menu data is available for this meal selection.
          </div>
        ) : (
          visibleMeals.map((mealGroup) => (
            <div key={mealGroup.meal} className="menu-meal-block">
              <div className="menu-station-stack">
                {mealGroup.stations.map((stationGroup) => {
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
                              <button
                                key={getItemKey(item)}
                                type="button"
                                className="menu-item-card button-reset-plain"
                                aria-haspopup="dialog"
                                onClick={(event) => {
                                  itemTriggerRef.current = event.currentTarget;
                                  setSelectedItemKey(getItemKey(item));
                                }}
                              >
                                <div className="menu-item-name">{item.name}</div>
                                <div className="menu-item-meta">
                                  {item.calories !== null ? (
                                    <span className="menu-item-calories">
                                      {formatCalories(item.calories)}
                                    </span>
                                  ) : (
                                    <span className="menu-item-calories menu-item-calories-empty">
                                      &nbsp;
                                    </span>
                                  )}
                                  {item.icons.length > 0 ? (
                                    <div
                                      className="menu-item-icons"
                                      aria-label="Allergen and dietary icons"
                                    >
                                      {item.icons.slice(0, 4).map((icon) =>
                                        icon.customIconUrl ? (
                                          <Image
                                            key={`${getItemKey(item)}-${icon.name}-${icon.customIconUrl}`}
                                            className="menu-item-icon"
                                            src={icon.customIconUrl}
                                            alt={icon.name}
                                            width={18}
                                            height={18}
                                            title={icon.helpText ?? icon.name}
                                          />
                                        ) : null,
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
      {selectedItem ? (
          <dialog
            ref={dialogRef}
            className="menu-modal"
            aria-modal="true"
            aria-labelledby="menu-item-modal-title"
            onCancel={(event) => {
              event.preventDefault();
              closeItemModal();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]',
              )).filter((element) => element.tabIndex >= 0 &&
                !element.hasAttribute("disabled") && element.getClientRects().length > 0);
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus({ preventScroll: true });
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus({ preventScroll: true });
              }
            }}
            onPointerDown={(event) => {
              backdropPointerDownRef.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
              if (!backdropPointerDownRef.current || event.target !== event.currentTarget) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (event.clientX < bounds.left || event.clientX > bounds.right ||
                  event.clientY < bounds.top || event.clientY > bounds.bottom) closeItemModal();
            }}
          >
            <div className="menu-modal-header">
              <div>
                <div className="menu-modal-kicker">
                  {selectedItem.station} |{" "}
                  {selectedItem.meal[0].toUpperCase() + selectedItem.meal.slice(1)}
                </div>
                <h3 id="menu-item-modal-title" className="menu-modal-title">
                  {selectedItem.name}
                </h3>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="menu-modal-close button-reset-plain"
                onClick={closeItemModal}
                aria-label="Close details"
              >
                ×
              </button>
            </div>
            <div className="menu-modal-body" role="region" aria-label="Menu item details" tabIndex={0}>
              {selectedItem.icons.length > 0 ? (
                <div className="menu-modal-icons">
                  {selectedItem.icons.map((icon) => (
                    <div
                      key={`${getItemKey(selectedItem)}-${icon.name}-${icon.customIconUrl ?? icon.slug ?? "icon"}`}
                      className="menu-modal-icon-chip"
                    >
                      {icon.customIconUrl ? (
                        <Image
                          className="menu-modal-icon-image"
                          src={icon.customIconUrl}
                          alt={icon.name}
                          width={20}
                          height={20}
                        />
                      ) : null}
                      <span>{icon.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedItem.nutritionInfo ? (
                <div className="nutrition-panel">
                  <div className="nutrition-panel-title">Nutrition Facts</div>
                  <div className="nutrition-panel-serving-row">
                    <span>Serving Size</span>
                    <span>
                      {[selectedItem.servingSize?.amount, selectedItem.servingSize?.unit]
                        .filter(Boolean)
                        .join(" ") || "1 portion"}
                    </span>
                  </div>
                  <div className="nutrition-panel-rule" />
                  <div className="nutrition-panel-amount">Amount per serving</div>
                  <div className="nutrition-panel-calories-row">
                    <span className="nutrition-panel-calories-label">Calories</span>
                    <span className="nutrition-panel-calories-value">
                      {formatMaybeNutritionValue(selectedItem.nutritionInfo.calories)}
                    </span>
                  </div>
                  <div className="nutrition-panel-rule nutrition-panel-rule-strong" />
                  <div className="nutrition-panel-dv">% Daily value not available</div>
                  {NUTRITION_ROWS.filter(
                    (row) => hasNumericValue(selectedItem.nutritionInfo?.[row.key]),
                  ).map((row) => (
                    <Fragment key={row.key}>
                      <div
                        className={`nutrition-row${row.indent ? " nutrition-row-indent" : ""}${row.strong ? " nutrition-row-strong" : ""}${row.key === "g_protein" ? " nutrition-row-no-border" : ""}`}
                      >
                        <span>{row.label}</span>
                        <span>
                          {formatMaybeNutritionValue(selectedItem.nutritionInfo?.[row.key])}
                          {row.unit}
                        </span>
                      </div>
                      {row.key === "g_protein" ? (
                        <div className="nutrition-panel-rule nutrition-panel-rule-strong nutrition-panel-rule-split" />
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              ) : null}
              {selectedItem.ingredients ? (
                <div className="menu-modal-section">
                  <div className="menu-modal-section-title">Ingredients</div>
                  <div className="menu-modal-section-copy">{selectedItem.ingredients}</div>
                </div>
              ) : null}
            </div>
          </dialog>
      ) : null}
    </>
  );
}
