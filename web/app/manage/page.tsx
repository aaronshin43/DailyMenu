import { ManageForm } from "@/components/manage-form";
import { isValidUuid } from "@/lib/validators";

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim() ?? "";

  return (
    <>
      <h2 className="section-title">Manage your preferences</h2>
      <p className="section-copy">
        Update meals and stations without exposing your email address in the
        browser URL.
      </p>
      {isValidUuid(token) ? (
        <ManageForm token={token} />
      ) : (
        <div className="message-box error">This manage link is invalid.</div>
      )}
    </>
  );
}
