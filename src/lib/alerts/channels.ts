/**
 * Alert notification delivery across multiple channels.
 *
 * All channels fire in parallel via Promise.allSettled.
 * Errors are logged but never thrown — delivery is fire-and-forget.
 */
import fs from 'fs';
import path from 'path';
import { emitEvent } from '@/lib/events/bus';
import type { AlertRule, AlertSeverity } from './types';

const NOTIFICATIONS_PATH = path.join(process.cwd(), 'data', 'notifications.json');
const MAX_NOTIFICATIONS = 100;

// ── Severity to notification type mapping ────────────────────────────────────

function severityToNotificationType(severity: AlertSeverity): 'info' | 'warning' | 'error' {
  switch (severity) {
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'error';
  }
}

// ── Channel implementations ──────────────────────────────────────────────────

async function deliverInApp(rule: AlertRule, message: string): Promise<void> {
  try {
    let notifications: Array<Record<string, unknown>> = [];
    try {
      if (fs.existsSync(NOTIFICATIONS_PATH)) {
        const raw = fs.readFileSync(NOTIFICATIONS_PATH, 'utf-8');
        notifications = JSON.parse(raw);
      }
    } catch {
      notifications = [];
    }

    const entry = {
      id: `alert-${rule.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: rule.name,
      message,
      type: severityToNotificationType(rule.severity),
      read: false,
    };

    notifications.unshift(entry);
    if (notifications.length > MAX_NOTIFICATIONS) {
      notifications = notifications.slice(0, MAX_NOTIFICATIONS);
    }

    const dataDir = path.dirname(NOTIFICATIONS_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATIONS_PATH, JSON.stringify(notifications, null, 2), 'utf-8');

    emitEvent('notification:new', {
      id: entry.id,
      timestamp: entry.timestamp,
      title: entry.title,
      message: entry.message,
      type: entry.type,
      read: false,
    });
  } catch (err) {
    console.error('[alert-channel] in_app delivery failed:', err);
  }
}

async function deliverWebhook(rule: AlertRule, value: number): Promise<void> {
  if (!rule.webhook_url) return;

  try {
    await fetch(rule.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: rule.name,
        severity: rule.severity,
        value,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[alert-channel] webhook delivery failed:', err);
  }
}

async function deliverTelegram(rule: AlertRule, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  if (!rule.telegram_chat_id) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: rule.telegram_chat_id,
        text: message,
      }),
    });
  } catch (err) {
    console.error('[alert-channel] telegram delivery failed:', err);
  }
}

async function deliverEmail(rule: AlertRule, message: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    const recipients = process.env.ALERT_EMAIL_RECIPIENTS ?? '';
    if (!recipients) return;

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'alerts@tenacitos.local',
      to: recipients,
      subject: `[${rule.severity.toUpperCase()}] ${rule.name}`,
      text: message,
    });
  } catch (err) {
    console.error('[alert-channel] email delivery failed:', err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function deliverAlert(rule: AlertRule, value: number): Promise<void> {
  const message = `Alert: ${rule.name} — ${rule.condition.metric} is ${value} (threshold: ${rule.condition.operator} ${rule.condition.value})`;

  const deliveries: Promise<void>[] = [];

  for (const channel of rule.channels) {
    switch (channel) {
      case 'in_app':
        deliveries.push(deliverInApp(rule, message));
        break;
      case 'webhook':
        deliveries.push(deliverWebhook(rule, value));
        break;
      case 'telegram':
        deliveries.push(deliverTelegram(rule, message));
        break;
      case 'email':
        deliveries.push(deliverEmail(rule, message));
        break;
    }
  }

  await Promise.allSettled(deliveries);
}

export async function deliverResolution(rule: AlertRule): Promise<void> {
  const message = `Resolved: ${rule.name} — condition is no longer met`;

  const deliveries: Promise<void>[] = [];

  for (const channel of rule.channels) {
    switch (channel) {
      case 'in_app':
        deliveries.push(deliverInApp(rule, message));
        break;
      case 'webhook':
        deliveries.push(deliverWebhook(rule, 0));
        break;
      case 'telegram':
        deliveries.push(deliverTelegram(rule, message));
        break;
      case 'email':
        deliveries.push(deliverEmail(rule, message));
        break;
    }
  }

  await Promise.allSettled(deliveries);
}
