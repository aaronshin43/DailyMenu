import nodemailer from "nodemailer";

import { getSmtpConfig } from "@/lib/config";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const smtp = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  await transporter.sendMail({
    from: smtp.user,
    to,
    subject,
    html,
  });
}
