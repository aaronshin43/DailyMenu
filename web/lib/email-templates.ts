import { getSiteUrl } from "@/lib/config";

function buildUrl(path: string, token: string): string {
  const baseUrl = getSiteUrl().replace(/\/$/, "");
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

export function generateConfirmationEmail(token: string): string {
  const confirmUrl = buildUrl("/confirm", token);

  return `
    <html>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #d32f2f;">Welcome to Dickinson Daily Menu</h2>
          <p>Please confirm your subscription to start receiving daily menus.</p>
          <div style="margin: 30px 0;">
            <a href="${confirmUrl}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Confirm Subscription
            </a>
          </div>
          <p style="font-size: 0.9em; color: #666;">If you did not request this, you can safely ignore this email.</p>
        </div>
      </body>
    </html>
  `;
}

export function generateManageLinkEmail(token: string): string {
  const manageUrl = buildUrl("/manage", token);

  return `
    <html>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #d32f2f;">Manage Your Preferences</h2>
          <p>You requested a link to manage your Dickinson Daily Menu preferences.</p>
          <div style="margin: 30px 0;">
            <a href="${manageUrl}" style="background-color: #d32f2f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Manage Preferences
            </a>
          </div>
          <p style="font-size: 0.9em; color: #666;">If you did not request this, you can ignore this email.</p>
        </div>
      </body>
    </html>
  `;
}
