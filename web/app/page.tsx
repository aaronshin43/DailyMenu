import { SubscribeForm } from "@/components/subscribe-form";

export default function HomePage() {
  return (
    <>
      <h2 className="section-title">Daily cafeteria menus at 7 AM</h2>
      <p className="section-copy">
        Choose the meals and stations you care about. New subscriptions require
        email confirmation. Existing subscribers receive a secure link for
        updates.
      </p>
      <SubscribeForm />
      <p className="footer-note">
        Token links are used for confirmation, preference management, and
        unsubscribe actions.
      </p>
    </>
  );
}
