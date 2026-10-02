import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

import AuthLayout from "@/components/layout/AuthLayout";
import { useAppStore } from "@/lib/store/index";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE } from '@/lib/api';

const RegisterPage = () => {
    const setPendingEmail = useAppStore((state) => state.setPendingEmail);
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [termsAccepted, setTermsAccepted] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState("");

    const [errors, setErrors] = useState<{
        email?: string;
        password?: string;
        confirmPassword?: string;
    }>({});

    const validate = (): boolean => {
        const newErrors: typeof errors = {};

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            newErrors.email = "Email is required.";
        } else if (!emailRegex.test(email)) {
            newErrors.email = "Please enter a valid email address.";
        }

        if (!password) {
            newErrors.password = "Password is required.";
        } else if (password.length < 8) {
            newErrors.password = "Password must be at least 8 characters.";
        }

        if (!confirmPassword) {
            newErrors.confirmPassword = "Please confirm your password.";
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = "Passwords do not match.";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setApiError("");

        if (!validate()) return;

        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/auth/register`,
                { email, password, confirmPassword, terms_accepted: true },
                { validateStatus: (s) => s < 500 }
            );

            // Only 2xx is success — 400/409 must show an error (BUGS NAV-08)
            if (res.status < 200 || res.status >= 300) {
                const data = res.data as { error?: string; message?: string };
                setApiError(data?.error ?? data?.message ?? "Registration failed. Please try again.");
                return;
            }

            // Hosted demo: account is verified immediately → go to sign in.
            if ((res.data as { autoVerified?: boolean })?.autoVerified) {
                navigate("/login", { replace: true, state: { email, registered: true } });
                return;
            }

            setPendingEmail(email);
            sessionStorage.setItem("pendingEmail", email);
            navigate("/verify-email", { state: { email } });
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response) {
                const data = err.response.data as { error?: string; message?: string };
                setApiError(data?.error ?? data?.message ?? "Registration failed. Please try again.");
            } else {
                setApiError("Unable to connect to the server. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[var(--text)]">
                        Create account
                    </CardTitle>
                    <CardDescription className="text-center text-[var(--text-2)] text-sm">
                        Register to access your SpineSurge workspace
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="grid gap-4 pb-4">
                        {/* Email */}
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-[var(--text-2)] text-xs tracking-wide uppercase">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="doctor@spine.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-2)]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                            {errors.email && (
                                <p className="text-xs text-[#FF453A]">{errors.email}</p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="grid gap-2">
                            <Label htmlFor="password" className="text-[var(--text-2)] text-xs tracking-wide uppercase">
                                Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Min. 8 characters"
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
                            {errors.password && (
                                <p className="text-xs text-[#FF453A]">{errors.password}</p>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className="grid gap-2">
                            <Label htmlFor="confirmPassword" className="text-[var(--text-2)] text-xs tracking-wide uppercase">
                                Confirm Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="Repeat your password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="h-11 rounded-md border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-2)]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                                >
                                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {errors.confirmPassword && (
                                <p className="text-xs text-[#FF453A]">{errors.confirmPassword}</p>
                            )}
                        </div>

                        {/* Terms checkbox */}
                        <div className="flex items-start gap-3 pt-1">
                            <input
                                id="terms"
                                type="checkbox"
                                checked={termsAccepted}
                                onChange={(e) => setTermsAccepted(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#FF453A]"
                            />
                            <Label
                                htmlFor="terms"
                                className="text-[var(--text-2)] text-xs leading-relaxed cursor-pointer"
                            >
                                I agree to the{" "}
                                <span className="text-[var(--text)] underline hover:text-[#FF453A] transition-colors">
                                    Terms of Service
                                </span>{" "}
                                and{" "}
                                <span className="text-[var(--text)] underline hover:text-[#FF453A] transition-colors">
                                    Clinical Use Disclaimer
                                </span>
                            </Label>
                        </div>

                        {/* API error */}
                        {apiError && (
                            <p className="text-xs text-[#FF453A] text-center">{apiError}</p>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pt-0">
                        <Button
                            className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)] disabled:opacity-50 disabled:cursor-not-allowed"
                            type="submit"
                            disabled={!termsAccepted || loading}
                        >
                            {loading ? "Creating account..." : "Create Account"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            <div className="text-center text-sm text-[var(--text-2)]">
                Already have an account?{" "}
                <Link
                    to="/login"
                    className="text-[var(--text)] underline hover:text-[#FF453A] transition-colors"
                >
                    Sign In
                </Link>
            </div>
        </AuthLayout>
    );
};

export default RegisterPage;
