import Link from "next/link";

import { FullMenuBrowser } from "@/components/full-menu-browser";
import { fetchGroupedMenuForDate, parseMenuDate } from "@/lib/menu";

export const dynamic = "force-dynamic";

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
    <>
      <h2 className="section-title">Full menu view</h2>
      <p className="section-copy">
        Browse one day at a time with stable meal and station ordering, then
        expand only the stations you want to inspect.
      </p>

      <div className="pill-row">
        <Link href={`/menu?date=${previousParam}`} className="pill-link">
          Previous day
        </Link>
        <Link href={`/menu?date=${currentParam}`} className="pill-link active">
          {currentParam}
        </Link>
        <Link href={`/menu?date=${nextParam}`} className="pill-link">
          Next day
        </Link>
      </div>

      <FullMenuBrowser date={currentParam} meals={groupedMenu} />
    </>
  );
}
