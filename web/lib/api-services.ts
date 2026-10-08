import "server-only";

import { createApiHandlers } from "@/lib/api-handlers";
import { getSupabaseConfig } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { generateConfirmationEmail, generateManageLinkEmail } from "@/lib/email-templates";
import { createRateLimiter, type LimitDecision } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getUserByEmail, getUserByToken, upsertPendingUser, updatePreferencesByToken,
  confirmUserByToken, deactivateUserByToken,
} from "@/lib/users";

const limits = createRateLimiter({
  secret: getSupabaseConfig().serviceRoleKey,
  onVercel: process.env.VERCEL === "1",
  async consume(rules) {
    const { data, error } = await supabaseAdmin
      .rpc("consume_api_limits", { p_rules: rules })
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) throw error;
    return data as LimitDecision;
  },
});

export const subscriptionApi = createApiHandlers({
  limits, getUserByEmail, getUserByToken, upsertPendingUser, updatePreferencesByToken,
  confirmUserByToken, deactivateUserByToken, sendEmail,
  generateConfirmationEmail, generateManageLinkEmail,
});
