"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  requestPasswordResetPinAction,
  resetPasswordWithPinAction,
  verifyPasswordResetPinAction,
} from "../actions";
import {
  ShieldCheck,
  Mail,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

type Step = "email" | "pin" | "password" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRequestPin(formData: FormData) {
    setError(null);
    setSuccess(null);
    const nextEmail = String(formData.get("email") || "").trim();
    startTransition(async () => {
      const result = await requestPasswordResetPinAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEmail(nextEmail);
      setSuccess(result?.message || "PIN sent to your email.");
      setStep("pin");
    });
  }

  function handleVerifyPin(formData: FormData) {
    setError(null);
    setSuccess(null);
    formData.set("email", email);
    startTransition(async () => {
      const result = await verifyPasswordResetPinAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      const nextPin = String(formData.get("pin") || "").replace(/\D/g, "");
      setPin(nextPin);
      setSuccess(result?.message || "PIN verified.");
      setStep("password");
    });
  }

  function handleResetPassword(formData: FormData) {
    setError(null);
    setSuccess(null);
    formData.set("email", email);
    formData.set("pin", pin);
    startTransition(async () => {
      const result = await resetPasswordWithPinAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(result?.message || "Password updated.");
      setStep("done");
    });
  }

  function handleResendPin() {
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const result = await requestPasswordResetPinAction(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(result?.message || "A new PIN has been sent.");
    });
  }

  return (
    <div className="min-h-screen flex w-full">
      <div className="w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-2xl font-bold shadow-2xl shadow-indigo-500/25 mb-4">
              U
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Reset Password</h1>
            <p className="text-slate-400 mt-2 text-sm">
              {step === "email" && "We email an 8-digit PIN (enter the code, not a magic link)."}
              {step === "pin" && "Enter the 8-digit PIN from your email."}
              {step === "password" && "PIN verified. Choose a new password."}
              {step === "done" && "Your password has been updated."}
            </p>
          </div>

          <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              <span className="text-sm font-medium text-slate-300">
                Secure reset · email PIN via Supabase
              </span>
            </div>

            {/* Step indicator */}
            <div className="mb-6 flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
              <span className={step === "email" ? "text-indigo-300 font-semibold" : ""}>1. Email</span>
              <span>→</span>
              <span className={step === "pin" ? "text-indigo-300 font-semibold" : ""}>2. PIN</span>
              <span>→</span>
              <span className={step === "password" || step === "done" ? "text-indigo-300 font-semibold" : ""}>
                3. New password
              </span>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-3">
                <Lock className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
                <span>{success}</span>
              </div>
            )}

            {step === "email" && (
              <form action={handleRequestPin} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-slate-300">
                    Admin Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="admin@uto.taxi"
                      disabled={isPending}
                      className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending PIN...
                    </>
                  ) : (
                    "Send PIN"
                  )}
                </button>
              </form>
            )}

            {step === "pin" && (
              <form action={handleVerifyPin} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="pin" className="text-sm font-medium text-slate-300">
                    Email PIN
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="pin"
                      name="pin"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6,8}"
                      maxLength={8}
                      required
                      autoComplete="one-time-code"
                      placeholder="8-digit PIN"
                      disabled={isPending}
                      className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 disabled:opacity-50 text-sm tracking-[0.35em] font-mono"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Use the numeric PIN from the email — ignore any magic link.
                  </p>
                  <p className="text-xs text-slate-500">
                    Sent to <span className="text-slate-300">{email}</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify PIN"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendPin}
                  disabled={isPending}
                  className="w-full text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                >
                  Resend PIN
                </button>
              </form>
            )}

            {step === "password" && (
              <form action={handleResetPassword} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-slate-300">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      disabled={isPending}
                      className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 disabled:opacity-50 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Repeat new password"
                      disabled={isPending}
                      className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 disabled:opacity-50 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating password...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </form>
            )}

            {step === "done" && (
              <Link
                href="/login"
                className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm hover:from-indigo-500 hover:to-purple-500 transition-all duration-200 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                Back to sign in
              </Link>
            )}

            {step !== "done" && (
              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
