import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE } from "@/lib/api";

/**
 * "Forgot your password?" (AUTH-01). Route: /forgot-password
 * 1. Email → a 6-digit code is emailed (10 minutes).
 * 2. Code + new password (twice) → password changed, back to sign-in.
 */
const inputCls = "h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-2)]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0";
const labelCls = "text-[var(--text-2)] text-xs tracking-wide uppercase";

async function post(path: string, body: unknown) {
    const r = await fetch(`${API_BASE}/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? d.message ?? "Something went wrong. Please try again.");
    return d as { message?: string };
}

const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState<"email" | "reset">("email");
    const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const sendCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError(null);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter the email you signed up with."); return; }
        setBusy(true);
        try {
            const d = await post("forgot-password", { email: email.trim() });
            setInfo(d.message ?? "We sent a 6-digit code to your email.");
            setStep("reset");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const reset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from the email."); return; }
        if (password.length < 8) { setError("The new password must be at least 8 characters."); return; }
        if (password !== confirm) { setError("The two passwords don't match."); return; }
        setBusy(true);
        try {
            await post("reset-password", { email: email.trim(), code: code.trim(), password, confirmPassword: confirm });
            navigate("/login", { replace: true, state: { email: email.trim(), passwordReset: true } });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[var(--text)]">Reset password</CardTitle>
                    <CardDescription className="text-center text-[var(--text-2)] text-sm">
                        {step === "email"
                            ? "Enter your email and we'll send you a 6-digit code."
                            : `Enter the code we sent to ${email.trim()} and choose a new password.`}
                    </CardDescription>
                </CardHeader>

                {step === "email" ? (
                    <form onSubmit={sendCode}>
                        <CardContent className="grid gap-4 pb-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email" className={labelCls}>Email</Label>
                                <Input id="email" type="email" autoFocus placeholder="doctor@spine.com" value={email}
                                    onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                            </div>
                            {error && <div className="text-sm text-[#FF453A]">{error}</div>}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-3 pt-0">
                            <Button type="submit" disabled={busy} className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33]">
                                {busy ? "Sending…" : "Send code"}
                            </Button>
                        </CardFooter>
                    </form>
                ) : (
                    <form onSubmit={reset}>
                        <CardContent className="grid gap-4 pb-4">
                            {info && <div className="text-sm text-[var(--text-2)]">{info} Check Spam/Promotions if it isn't in your inbox within a minute.</div>}
                            <div className="grid gap-2">
                                <Label htmlFor="code" className={labelCls}>6-digit code</Label>
                                <Input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="123456"
                                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${inputCls} tracking-[0.4em] text-center text-lg`} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password" className={labelCls}>New password</Label>
                                <div className="relative">
                                    <Input id="password" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters"
                                        value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
                                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-2)] hover:text-[var(--text)]">
                                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm" className={labelCls}>Repeat new password</Label>
                                <Input id="confirm" type={show ? "text" : "password"} autoComplete="new-password"
                                    value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
                            </div>
                            {error && <div className="text-sm text-[#FF453A]">{error}</div>}
                        </CardContent>
                        <CardFooter className="flex flex-col gap-3 pt-0">
                            <Button type="submit" disabled={busy} className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33]">
                                {busy ? "Saving…" : "Set new password"}
                            </Button>
                            <div className="flex w-full justify-between text-xs text-[var(--text-2)]">
                                <button type="button" onClick={() => { setStep("email"); setError(null); }} className="underline hover:text-[var(--text)]">Use another email</button>
                                <button type="button" disabled={busy} onClick={() => void sendCode()} className="underline hover:text-[var(--text)] disabled:opacity-50">Send a new code</button>
                            </div>
                        </CardFooter>
                    </form>
                )}
            </Card>
            <div className="flex justify-center text-sm text-[var(--text-2)]">
                <Link to="/login" className="underline hover:text-[#FF453A] transition-colors">Back to sign in</Link>
            </div>
        </AuthLayout>
    );
};

export default ForgotPasswordPage;
