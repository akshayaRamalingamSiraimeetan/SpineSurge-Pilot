import AuthLayout from "@/components/layout/AuthLayout";
import { useAppStore } from "@/lib/store/index";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

const LoginPage = () => {
    const loginWithCredentials = useAppStore((state) => state.loginWithCredentials);
    const navigate = useNavigate();
    const location = useLocation();
    const navState = location.state as { email?: string; registered?: boolean } | null;
    // Hosted demo: the build can pre-fill a shared demo login (VITE_DEMO_*).
    const [email, setEmail] = useState(navState?.email ?? import.meta.env.VITE_DEMO_EMAIL ?? "");
    const [password, setPassword] = useState(navState?.email ? "" : (import.meta.env.VITE_DEMO_PASSWORD ?? ""));
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [emailNotVerified, setEmailNotVerified] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        setEmailNotVerified(false);

        try {
            await loginWithCredentials(email, password);
            navigate("/dashboard");
        } catch (err: unknown) {
            const error = err as { code?: string; message?: string };
            if (error?.code === 'EMAIL_NOT_VERIFIED' || error?.message === 'EMAIL_NOT_VERIFIED') {
                setEmailNotVerified(true);
                setErrorMessage("Please verify your email before signing in.");
            } else {
                setErrorMessage(error?.message ?? "Invalid credentials. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[var(--text)]">Welcome back</CardTitle>
                    <CardDescription className="text-center text-[var(--text-2)] text-sm">
                        Enter your credentials to access your workspace
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="grid gap-4 pb-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-[var(--text-2)] text-xs tracking-wide uppercase">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="doctor@spine.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-2)]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password" className="text-[var(--text-2)] text-xs tracking-wide uppercase">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-2)]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {navState?.registered && !errorMessage && (
                            <div className="text-sm text-[var(--val-good)]">Account created — sign in to continue.</div>
                        )}

                        {/* Error message */}
                        {errorMessage && (
                            <div className="text-sm text-[#FF453A]">
                                {errorMessage}
                                {emailNotVerified && (
                                    <span className="ml-1">
                                        <Link
                                            to="/verify-email"
                                            state={{ email }}
                                            onClick={() => sessionStorage.setItem('pendingEmail', email)}
                                            className="underline hover:text-[#FF453A]/80">
                                            Verify email
                                        </Link>
                                    </span>
                                )}
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 pt-0">
                        <Button
                            className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "Signing in..." : "Sign In"}
                        </Button>

                        <div className="relative w-full">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-[var(--border)]" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[var(--surface)] px-3 text-[var(--text-2)] tracking-wide">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                            type="button"
                        >
                            Hospital SSO
                        </Button>
                    </CardFooter>
                </form>
            </Card>
            <div className="flex flex-col items-center gap-2 text-sm text-[var(--text-2)]">
                <a href="#" className="underline hover:text-[#FF453A] transition-colors">
                    Forgot your password?
                </a>
                <span>
                    Don't have an account?{" "}
                    <Link to="/register" className="text-[var(--text)] underline hover:text-[#FF453A] transition-colors">
                        Create Account
                    </Link>
                </span>
            </div>
        </AuthLayout>
    );
};

export default LoginPage;
