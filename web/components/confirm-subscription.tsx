"use client";

import { useEffect, useState } from "react";

type State = {
  tone: "error" | "success";
  message: string;
} | null;

export function ConfirmSubscription({ token }: { token: string }) {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      try {
        const response = await fetch("/api/confirm", {
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
          throw new Error(payload.error ?? "Unable to confirm subscription.");
        }

        if (!cancelled) {
          setState({
            tone: "success",
            message:
              payload.message ??
              "Subscription confirmed. Daily emails will resume on the next send.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            tone: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to confirm subscription.",
          });
        }
      }
    }

    void confirm();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!state) {
    return <div className="message-box info">Confirming your subscription...</div>;
  }

  return <div className={`message-box ${state.tone}`}>{state.message}</div>;
}
