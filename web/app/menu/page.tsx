import { FullMenuBrowser } from "@/components/full-menu-browser";
import { fetchGroupedMenuForDate, parseMenuDate } from "@/lib/menu";

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
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const selectedDate = parseMenuDate(params.date);
  const groupedMenu = await fetchGroupedMenuForDate(selectedDate);
  const currentParam = formatDateParam(selectedDate);
  const nextParam = formatDateParam(shiftDate(selectedDate, 1));
  const previousParam = formatDateParam(shiftDate(selectedDate, -1));

  return (
    <FullMenuBrowser
      date={currentParam}
      meals={groupedMenu}
      previousHref={`/menu?date=${previousParam}`}
      nextHref={`/menu?date=${nextParam}`}
      subscribeHref="/"
    />
  );
}
