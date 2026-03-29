"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { AlertRule, AlertChannel, AlertSeverity } from "@/lib/alerts/types";

const METRIC_OPTIONS = [
  { label: "CPU Usage (%)", value: "system.cpu" },
  { label: "RAM Usage (%)", value: "system.ram" },
  { label: "Disk Usage (%)", value: "system.disk" },
  { label: "Daily Cost ($)", value: "cost.daily.total" },
  { label: "Gateway Status", value: "gateway.status" },
];

const OPERATOR_OPTIONS: { label: string; value: AlertRule["condition"]["operator"] }[] = [
  { label: ">", value: "gt" },
  { label: "<", value: "lt" },
  { label: "=", value: "eq" },
  { label: ">=", value: "gte" },
  { label: "<=", value: "lte" },
];

const SEVERITY_OPTIONS: AlertSeverity[] = ["info", "warning", "critical"];

const CHANNEL_OPTIONS: { label: string; value: AlertChannel }[] = [
  { label: "In-App", value: "in_app" },
  { label: "Webhook", value: "webhook" },
  { label: "Telegram", value: "telegram" },
  { label: "Email", value: "email" },
];

const SEVERITY_COLORS: Record<string, string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  critical: "#ef4444",
};

interface RuleEditorProps {
  rule?: AlertRule | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RuleEditor({ rule, onClose, onSaved }: RuleEditorProps) {
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name ?? "");
  const [metric, setMetric] = useState(rule?.condition.metric ?? METRIC_OPTIONS[0].value);
  const [operator, setOperator] = useState<AlertRule["condition"]["operator"]>(rule?.condition.operator ?? "gt");
  const [value, setValue] = useState<number>(rule?.condition.value ?? 90);
  const [sustainedChecks, setSustainedChecks] = useState(rule?.sustained_checks ?? 1);
  const [cooldownMinutes, setCooldownMinutes] = useState(rule?.cooldown_minutes ?? 15);
  const [severity, setSeverity] = useState<AlertSeverity>(rule?.severity ?? "warning");
  const [channels, setChannels] = useState<Set<AlertChannel>>(new Set(rule?.channels ?? ["in_app"]));
  const [webhookUrl, setWebhookUrl] = useState(rule?.webhook_url ?? "");
  const [telegramChatId, setTelegramChatId] = useState(rule?.telegram_chat_id ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function toggleChannel(ch: AlertChannel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Rule name is required");
      return;
    }
    if (channels.size === 0) {
      setError("At least one channel must be selected");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        condition: { metric, operator, value },
        sustained_checks: sustainedChecks,
        cooldown_minutes: cooldownMinutes,
        severity,
        channels: Array.from(channels),
        enabled: rule?.enabled ?? true,
      };

      if (channels.has("webhook") && webhookUrl.trim()) {
        body.webhook_url = webhookUrl.trim();
      }
      if (channels.has("telegram") && telegramChatId.trim()) {
        body.telegram_chat_id = telegramChatId.trim();
      }

      const url = isEdit ? `/api/alerts/${rule.id}` : "/api/alerts";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to save rule (${res.status})`);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
    color: "var(--text-primary)",
    fontSize: "13px",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "4px",
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1000, backgroundColor: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {isEdit ? "Edit Alert Rule" : "Create Alert Rule"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
          {error && (
            <div
              className="text-sm p-3 rounded-lg"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "var(--error, #ef4444)",
                border: "1px solid var(--error, #ef4444)",
              }}
            >
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label style={labelStyle}>Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High CPU Alert"
              style={inputStyle}
            />
          </div>

          {/* Condition: metric + operator + value */}
          <div>
            <label style={labelStyle}>Condition</label>
            <div className="flex gap-2">
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as AlertRule["condition"]["operator"])}
                style={{ ...inputStyle, flex: 0, width: "70px", minWidth: "70px" }}
              >
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          {/* Sustained checks + cooldown */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label style={labelStyle}>Sustained Checks</label>
              <input
                type="number"
                min={1}
                value={sustainedChecks}
                onChange={(e) => setSustainedChecks(Math.max(1, parseInt(e.target.value) || 1))}
                style={inputStyle}
              />
            </div>
            <div className="flex-1">
              <label style={labelStyle}>Cooldown (minutes)</label>
              <input
                type="number"
                min={0}
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Severity */}
          <div>
            <label style={labelStyle}>Severity</label>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map((sev) => (
                <label
                  key={sev}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-medium transition-all"
                  style={{
                    border: severity === sev
                      ? `2px solid ${SEVERITY_COLORS[sev]}`
                      : "2px solid var(--border)",
                    backgroundColor: severity === sev
                      ? `${SEVERITY_COLORS[sev]}18`
                      : "transparent",
                    color: severity === sev ? SEVERITY_COLORS[sev] : "var(--text-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={sev}
                    checked={severity === sev}
                    onChange={() => setSeverity(sev)}
                    className="sr-only"
                  />
                  {sev}
                </label>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div>
            <label style={labelStyle}>Channels</label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => (
                <label
                  key={ch.value}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs"
                  style={{
                    border: channels.has(ch.value)
                      ? "2px solid var(--accent, #6366f1)"
                      : "2px solid var(--border)",
                    backgroundColor: channels.has(ch.value)
                      ? "rgba(99, 102, 241, 0.1)"
                      : "transparent",
                    color: channels.has(ch.value) ? "var(--accent, #6366f1)" : "var(--text-secondary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={channels.has(ch.value)}
                    onChange={() => toggleChannel(ch.value)}
                    className="sr-only"
                  />
                  {ch.label}
                </label>
              ))}
            </div>
          </div>

          {/* Conditional: Webhook URL */}
          {channels.has("webhook") && (
            <div>
              <label style={labelStyle}>Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/..."
                style={inputStyle}
              />
            </div>
          )}

          {/* Conditional: Telegram Chat ID */}
          {channels.has("telegram") && (
            <div>
              <label style={labelStyle}>Telegram Chat ID</label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="-100123456789"
                style={inputStyle}
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.05))",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: "var(--accent, #6366f1)",
                color: "#fff",
                border: "none",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Update Rule" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
