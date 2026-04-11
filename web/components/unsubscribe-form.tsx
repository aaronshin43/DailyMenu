"use client";

import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  async function handleClick() {
    setPending(true);
    setState(null);

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to unsubscribe.");
      }

      setState({
        tone: "success",
        message: payload.message ?? "You have been unsubscribed.",
      });
    } catch (error) {
      setState({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to unsubscribe.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <p className="section-copy">
        This will stop future daily menu emails for this address. You can
        subscribe again later with a new confirmation email.
      </p>

      {state ? (
        <div className={`message-box ${state.tone}`}>{state.message}</div>
      ) : null}

      <div className="button-row">
        <button className="button" type="button" onClick={handleClick} disabled={pending}>
          {pending ? "Updating..." : "Unsubscribe"}
        </button>
      </div>
    </div>
  );
}
