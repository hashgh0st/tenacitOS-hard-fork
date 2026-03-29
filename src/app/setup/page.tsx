"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Terminal,
  User,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ShieldCheck,
  ArrowRight,
  SkipForward,
} from "lucide-react";

type SetupStep = "loading" | "account" | "totp" | "done";

export default function SetupPage() {
  const [step, setStep] = useState<SetupStep>("loading");
  const [canSetup, setCanSetup] = useState(false);

  // Account fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // TOTP fields
  const [totpSecret, setTotpSecret] = useState("");
  const [totpQrUrl, setTotpQrUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState("");

  const router = useRouter();

  // Check if setup is needed
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch("/api/auth/setup/check");
        const data = await res.json();
        if (data.needsSetup) {
          setCanSetup(true);
          setStep("account");
        } else {
          // Already set up, redirect to login
          router.push("/login");
        }
      } catch {
        setCanSetup(false);
        setStep("account");
        setError("Failed to check setup status");
      }
    }

    checkSetup();
  }, [router]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 16) {
      setError("Password must be at least 16 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Setup failed");
        setLoading(false);
        return;
      }

      // Account created. Now offer TOTP setup.
      // We need to be logged in first to set up TOTP
      // The setup endpoint should have created a session for us
      setStep("totp");
    } catch {
      setError("Connection error");
    }

    setLoading(false);
  };

  const handleSetupTotp = async () => {
    setTotpLoading(true);
    setTotpError("");

    try {
      const res = await fetch("/api/auth/totp/setup", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTotpError(data.error || "Failed to generate TOTP secret");
        setTotpLoading(false);
        return;
      }

      setTotpSecret(data.secret);
      setTotpQrUrl(data.qrDataUrl);
    } catch {
      setTotpError("Connection error");
    }

    setTotpLoading(false);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpLoading(true);
    setTotpError("");

    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode, secret: totpSecret }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTotpError(data.error || "Invalid TOTP code");
        setTotpLoading(false);
        return;
      }

      setStep("done");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setTotpError("Connection error");
    }

    setTotpLoading(false);
  };

  const handleSkipTotp = () => {
    setStep("done");
    setTimeout(() => router.push("/login"), 2000);
  };

  // Loading state
  if (step === "loading") {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: "var(--background)" }}
      >
        <div
          className="rounded-xl p-10"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2
              className="w-8 h-8 animate-spin"
              style={{ color: "var(--accent)" }}
            />
            <p style={{ color: "var(--text-secondary)" }} className="text-sm">
              Checking setup status...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-md">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {["Account", "Security", "Done"].map((label, i) => {
            const stepIndex =
              step === "account" ? 0 : step === "totp" ? 1 : 2;
            const isActive = i === stepIndex;
            const isComplete = i < stepIndex;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className="w-8 h-px"
                    style={{
                      backgroundColor:
                        isComplete || isActive
                          ? "var(--accent)"
                          : "var(--border)",
                    }}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      backgroundColor: isComplete
                        ? "var(--accent)"
                        : isActive
                          ? "var(--accent)"
                          : "var(--card-elevated)",
                      color: isComplete || isActive ? "white" : "var(--text-muted)",
                      border:
                        !isComplete && !isActive
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className="text-[10px]"
                    style={{
                      color: isActive
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="rounded-xl p-10"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Header */}
          <div className="text-center mb-6 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2.5">
              <Terminal
                className="w-7 h-7"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-2xl">🦞</span>
              <h1
                className="text-xl font-bold"
                style={{
                  fontFamily: "var(--font-heading)",
                  color: "var(--text-primary)",
                  letterSpacing: "-0.5px",
                }}
              >
                {step === "account" && "Welcome to Mission Control"}
                {step === "totp" && "Secure Your Account"}
                {step === "done" && "All Set!"}
              </h1>
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              {step === "account" &&
                "Create your admin account to get started"}
              {step === "totp" &&
                "Add two-factor authentication for extra security"}
              {step === "done" &&
                "Your account has been created successfully"}
            </p>
          </div>

          {/* Step 1: Account Creation */}
          {step === "account" && canSetup && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Admin username"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Password (16+ characters)"
                  autoComplete="new-password"
                  minLength={16}
                  required
                />
              </div>

              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={16}
                  required
                />
              </div>

              {password.length > 0 && password.length < 16 && (
                <p className="text-xs" style={{ color: "var(--warning)" }}>
                  Password needs at least {16 - password.length} more character
                  {16 - password.length !== 1 ? "s" : ""}
                </p>
              )}

              {error && (
                <div
                  className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
                  style={{
                    backgroundColor: "var(--error-bg)",
                    color: "var(--error)",
                  }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "white",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Admin Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: TOTP Setup */}
          {step === "totp" && (
            <div className="space-y-4">
              {!totpQrUrl ? (
                <div className="space-y-4">
                  <p
                    className="text-sm text-center"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Two-factor authentication adds an extra layer of security to
                    your account. You can set it up now or skip and do it later.
                  </p>

                  <button
                    onClick={handleSetupTotp}
                    disabled={totpLoading}
                    className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "white",
                    }}
                  >
                    {totpLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Set Up 2FA
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSkipTotp}
                    className="w-full py-2 text-sm transition-colors flex items-center justify-center gap-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <SkipForward className="w-3 h-3" />
                    Skip for now
                  </button>
                </div>
              ) : (
                <form onSubmit={handleVerifyTotp} className="space-y-4">
                  <div className="flex justify-center">
                    {/* QR code is a data URL image */}
                    <div
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: "white",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={totpQrUrl}
                        alt="TOTP QR Code"
                        width={180}
                        height={180}
                      />
                    </div>
                  </div>

                  <div
                    className="text-center text-xs px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--card-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono, monospace)",
                      wordBreak: "break-all",
                    }}
                  >
                    {totpSecret}
                  </div>

                  <p
                    className="text-xs text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Scan the QR code with your authenticator app, then enter the
                    6-digit code below.
                  </p>

                  <div className="relative">
                    <ShieldCheck
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6);
                        setTotpCode(val);
                      }}
                      className="w-full pl-11 pr-4 py-3 rounded-lg text-sm tracking-widest"
                      style={{
                        backgroundColor: "var(--card-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      required
                    />
                  </div>

                  {totpError && (
                    <div
                      className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
                      style={{
                        backgroundColor: "var(--error-bg)",
                        color: "var(--error)",
                      }}
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {totpError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={totpLoading || totpCode.length !== 6}
                    className="w-full font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "white",
                    }}
                  >
                    {totpLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Enable 2FA"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipTotp}
                    className="w-full py-2 text-sm transition-colors flex items-center justify-center gap-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <SkipForward className="w-3 h-3" />
                    Skip for now
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle
                className="w-12 h-12"
                style={{ color: "var(--success)" }}
              />
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Redirecting to login...
              </p>
            </div>
          )}

          {/* Footer */}
          <p
            className="text-center text-xs mt-6"
            style={{ color: "var(--text-muted)" }}
          >
            Tenacitas Agent Dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
