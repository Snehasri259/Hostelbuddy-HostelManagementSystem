import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter = null;
export const mailEnabled = () => Boolean(config.smtp.host);

function getTransporter() {
  if (!transporter) {
    const s = config.smtp;
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.password } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/** Never throws. Returns NOT_CONFIGURED | SENT | FAILED. */
export async function sendMail({ to, subject, text }) {
  if (!mailEnabled() || !to) return 'NOT_CONFIGURED';
  try {
    await getTransporter().sendMail({ from: config.smtp.from, to, subject: String(subject).replace(/[\r\n]+/g, ' '), text });
    return 'SENT';
  } catch (e) {
    console.error('[mail] delivery failed:', e.message);
    return 'FAILED';
  }
}
