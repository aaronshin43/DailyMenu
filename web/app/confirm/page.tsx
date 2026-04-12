import { ConfirmSubscription } from "@/components/confirm-subscription";
import { isValidUuid } from "@/lib/validators";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim() ?? "";

  return (
    <>
      <h2 className="section-title">Confirm subscription</h2>
      <p className="section-copy">
        This activates your subscription for the next scheduled daily send.
      </p>
      {isValidUuid(token) ? (
        <ConfirmSubscription token={token} />
      ) : (
        <div className="message-box error">This confirmation link is invalid.</div>
      )}
    </>
  );
}
