import Link from "next/link";

import { fetchMenuRange, parseDays, parseStartDate } from "@/lib/menu";

export const dynamic = "force-dynamic";

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatDateParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; days?: string }>;
}) {
  const params = await searchParams;
  const startDate = parseStartDate(params.start);
  const days = parseDays(params.days);
  const menu = await fetchMenuRange(startDate, days);
  const startParam = formatDateParam(startDate);
  const nextDayParam = formatDateParam(shiftDate(startDate, 1));
  const previousDayParam = formatDateParam(shiftDate(startDate, -1));

  return (
    <>
      <h2 className="section-title">Full menu view</h2>
      <p className="section-copy">
        Browse the cafeteria menu with fixed date, meal, and station ordering
        instead of the school site layout.
      </p>

      <div className="pill-row">
        <Link
          href={`/menu?start=${startParam}&days=1`}
          className={`pill-link${days === 1 ? " active" : ""}`}
        >
          This day only
        </Link>
        <Link
          href={`/menu?start=${startParam}&days=2`}
          className={`pill-link${days === 2 ? " active" : ""}`}
        >
          This day + next day
        </Link>
        <Link href={`/menu?start=${nextDayParam}&days=${days}`} className="pill-link">
          Shift forward
        </Link>
        <Link href={`/menu?start=${previousDayParam}&days=${days}`} className="pill-link">
          Shift back
        </Link>
      </div>

      {menu.length === 0 ? (
        <div className="message-box info">
          No menu data is available for this range. Try another day.
        </div>
      ) : (
        menu.map((day) => (
          <section key={day.date} className="menu-date-card">
            <h3 className="menu-date-title">{formatDateLabel(day.date)}</h3>
            {day.meals.map((mealGroup) => (
              <div key={mealGroup.meal} className="menu-meal-block">
                <h4 className="menu-meal-title">
                  {mealGroup.meal[0].toUpperCase() + mealGroup.meal.slice(1)}
                </h4>
                <div className="menu-card-grid">
                  {mealGroup.items.map((item) => (
                    <article
                      key={`${item.date}-${item.meal}-${item.station}-${item.name}`}
                      className="menu-item-card"
                    >
                      <div className="menu-item-station">{item.station}</div>
                      <div className="menu-item-name">{item.name}</div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}
