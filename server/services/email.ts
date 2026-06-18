import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
}

// Read provider once at module initialisation time.
const provider = process.env.EMAIL_PROVIDER ?? 'mock';

// Only one client is ever constructed, determined by the EMAIL_PROVIDER env var.
// This guarantees strict mutual exclusivity: when EMAIL_PROVIDER="mock", no
// network clients are initialised; when EMAIL_PROVIDER="resend", no SMTP
// connection is ever created; and vice versa.
let resendClient: Resend | null = null;
let smtpTransport: nodemailer.Transporter | null = null;

if (provider === 'resend') {
  resendClient = new Resend(process.env.EMAIL_API_KEY);
} else if (provider === 'smtp') {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}
// mock: nothing initialised — no network calls whatsoever

/**
 * Sends an email using the configured provider (mock, resend, or smtp).
 * Send failures are caught and logged to console.error; they are never
 * propagated to the caller so that OTP flows remain resilient to transient
 * delivery issues.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  try {
    if (provider === 'mock') {
      console.log('[Email Mock]', options);
    } else if (provider === 'resend' && resendClient) {
      await resendClient.emails.send({
        from: process.env.EMAIL_FROM ?? 'noreply@spinesurge.com',
        to: options.to,
        subject: options.subject,
        text: options.text,
      });
    } else if (provider === 'smtp' && smtpTransport) {
      await smtpTransport.sendMail({
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
      });
    }
  } catch (err) {
    console.error('[Email Service Error]', err);
  }
}
