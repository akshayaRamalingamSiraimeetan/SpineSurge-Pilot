import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outgoing email (sign-up codes, invitations). EMAIL_PROVIDER:
 *   mock   — (default) printed to the server log only; nobody receives anything
 *   smtp   — any SMTP account, e.g. Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=587
 *            SMTP_USER=<gmail> SMTP_PASS=<16-char app password> EMAIL_FROM="SpineSurge <gmail>"
 *   resend — Resend HTTP API (EMAIL_API_KEY; EMAIL_FROM on a domain verified in Resend)
 *   brevo  — Brevo HTTP API, free 300/day, no domain needed: BREVO_API_KEY, EMAIL_FROM = a sender
 *            address verified in Brevo (e.g. your Gmail). Works on free hosts that block SMTP.
 * Exactly one client is created (DEPLOY-04).
 */
// A provider without credentials counts as mock — sign-up must never wait for a code that can't be sent.
const configured = process.env.EMAIL_PROVIDER ?? 'mock';
const provider =
  configured === 'smtp' && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? 'smtp'
  : configured === 'resend' && process.env.EMAIL_API_KEY ? 'resend'
  : configured === 'brevo' && process.env.BREVO_API_KEY && process.env.EMAIL_FROM ? 'brevo'
  : 'mock';
if (provider !== configured) console.warn(`[email] EMAIL_PROVIDER=${configured} but its credentials are missing — using mock`);

/** True when codes really reach the user's inbox — sign-up then requires the code. */
export const emailEnabled = provider === 'smtp' || provider === 'resend' || provider === 'brevo';

let resendClient: Resend | null = null;
let smtpTransport: nodemailer.Transporter | null = null;

if (provider === 'resend') {
  resendClient = new Resend(process.env.EMAIL_API_KEY);
} else if (provider === 'smtp') {
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS from the start; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  // Tell the operator at startup if the credentials are wrong, not at the first sign-up.
  smtpTransport.verify()
    .then(() => console.log(`[email] SMTP ready (${process.env.SMTP_HOST}:${port})`))
    .catch((e) => console.error('[email] SMTP login failed — sign-up codes will not be delivered:', e.message));
}
if (!emailEnabled) console.log('[email] EMAIL_PROVIDER=mock — emails are only printed to this log');

const fromAddress = () => process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? 'SpineSurge <noreply@spinesurge.com>';

/**
 * Sends one email. Never throws; returns whether it was handed to the provider
 * so callers can tell the user when a code could not be sent.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    if (provider === 'resend' && resendClient) {
      const { error } = await resendClient.emails.send({ from: fromAddress(), to: options.to, subject: options.subject, text: options.text, html: options.html });
      if (error) throw new Error(error.message);
      return true;
    }
    if (provider === 'brevo') {
      // "Name <email>" or a bare address
      const m = fromAddress().match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
      const sender = m ? { name: m[1] || 'SpineSurge', email: m[2] } : { name: 'SpineSurge', email: fromAddress().trim() };
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY!, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: options.to }], subject: options.subject, textContent: options.text, htmlContent: options.html ?? `<pre>${options.text}</pre>` }),
      });
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`);
      return true;
    }
    if (provider === 'smtp' && smtpTransport) {
      await smtpTransport.sendMail({ from: fromAddress(), to: options.to, subject: options.subject, text: options.text, html: options.html });
      return true;
    }
    console.log('[Email Mock]', options);
    return true;
  } catch (err) {
    console.error('[Email Service Error]', err);
    return false;
  }
}

/** "Forgot your password?" code (AUTH-01). */
export function resetEmail(code: string): Pick<SendEmailOptions, 'subject' | 'text' | 'html'> {
  return {
    subject: `${code} is your SpineSurge password reset code`,
    text: `Your SpineSurge password reset code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask to reset your password, ignore this email — your password stays the same.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
      <h2 style="margin:0 0 12px">Reset your SpineSurge password</h2>
      <p>Your reset code:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
      <p style="color:#666;font-size:13px">It expires in 10 minutes. If you didn't ask to reset your password, ignore this email — your password stays the same.</p>
    </div>`,
  };
}

/** The sign-up / resend code email. */
export function codeEmail(code: string): Pick<SendEmailOptions, 'subject' | 'text' | 'html'> {
  return {
    subject: `${code} is your SpineSurge verification code`,
    text: `Your SpineSurge verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't create a SpineSurge account, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
      <h2 style="margin:0 0 12px">Verify your SpineSurge account</h2>
      <p>Your verification code:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
      <p style="color:#666;font-size:13px">It expires in 10 minutes. If you didn't create a SpineSurge account, ignore this email.</p>
    </div>`,
  };
}
