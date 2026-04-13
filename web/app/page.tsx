import Link from "next/link";

import { SubscribeForm } from "@/components/subscribe-form";

export default function HomePage() {
  return (
    <>
      <div className="button-row button-row-centered button-row-nav">
        <Link href="/menu" className="button button-link button-secondary">
          Browse today&apos;s menu
        </Link>
      </div>
      <SubscribeForm />
    </>
  );
}
