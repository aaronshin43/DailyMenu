import { subscriptionApi } from "@/lib/api-services";

export const runtime = "nodejs";

export const GET = subscriptionApi.getPreferences;
export const POST = subscriptionApi.updatePreferences;
