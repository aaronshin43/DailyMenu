import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { isValidUuid } from "@/lib/validators";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim() ?? "";

  return (
    <>
      <h2 className="section-title">Unsubscribe</h2>
      <p className="section-copy">
        Use the button below to disable future Dickinson Daily Menu emails for
        this token.
      </p>
      {isValidUuid(token) ? (
        <UnsubscribeForm token={token} />
      ) : (
        <div className="message-box error">This unsubscribe link is invalid.</div>
      )}
    </>
  );
}
