function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSiteUrl(): string {
  return process.env.SITE_URL || "http://localhost:3000";
}

export function getSupabaseConfig() {
  return {
    url: getRequiredEnv("SUPABASE_URL"),
    serviceRoleKey: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getSmtpConfig() {
  return {
    host: process.env.SMTP_SERVER ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? "587"),
    user: getRequiredEnv("SMTP_EMAIL"),
    pass: getRequiredEnv("SMTP_PASSWORD"),
  };
}
