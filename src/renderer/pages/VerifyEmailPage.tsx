import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import AuthLayout from '@/components/layout/AuthLayout';
import { useAppStore } from '@/lib/store/index';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const BASE_URL = 'http://localhost:3001';

const VerifyEmailPage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const setToken = useAppStore((state) => state.setToken);
    const setIsEmailVerified = useAppStore((state) => state.setIsEmailVerified);
    const setPendingEmail = useAppStore((state) => state.setPendingEmail);

    const [email, setEmail] = useState<string>('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendMessage, setResendMessage] = useState<string | null>(null);

    useEffect(() => {
        const stateEmail = (location.state as { email?: string } | null)?.email;
        if (stateEmail) {
            setPendingEmail(stateEmail);
            sessionStorage.setItem('pendingEmail', stateEmail);
            setEmail(stateEmail);
        } else {
            const stored = sessionStorage.getItem('pendingEmail');
            if (stored) {
                setEmail(stored);
            } else {
                navigate('/register');
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResendMessage(null);

        try {
            const res = await axios.post(
                `${BASE_URL}/auth/verify-email`,
                { email, otp },
                { validateStatus: (s) => s < 500 }
            );

            if (res.status === 200) {
                setToken(res.data.token);
                setIsEmailVerified(true);
                sessionStorage.removeItem('pendingEmail');
                setPendingEmail(null);
                navigate('/complete-profile');
            } else {
                const code = res.data?.code;
                if (code === 'INVALID_OTP') {
                    setError('The verification code is incorrect. Please try again.');
                } else if (code === 'EXPIRED_OTP') {
                    setError('Your code has expired. Please request a new one.');
                } else if (code === 'OTP_LOCKED') {
                    setError('Too many invalid verification attempts. Please try again later.');
                } else {
                    setError(res.data?.error ?? 'Verification failed. Please try again.');
                }
                // OTP input is preserved — do not clear otp state
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResendLoading(true);
        setError(null);
        setResendMessage(null);

        try {
            const res = await axios.post(
                `${BASE_URL}/auth/resend-verification`,
                { email },
                { validateStatus: (s) => s < 500 }
            );

            if (res.status === 200) {
                setResendMessage('A new verification code has been sent to your email.');
                setOtp('');
            } else {
                setError(res.data?.error ?? 'Failed to resend code. Please try again.');
                // OTP input left unchanged on failure
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[#242427] bg-[#141416] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[#F5F5F7]">
                        Verify your email
                    </CardTitle>
                    <CardDescription className="text-center text-[#9CA3AF] text-sm">
                        {email
                            ? `We've sent a verification code to ${email}`
                            : "We've sent a verification code to your email"}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="grid gap-4 pb-4">
                        <div className="grid gap-2">
                            <Label
                                htmlFor="otp"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Verification Code
                            </Label>
                            <Input
                                id="otp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => {
                                    // Allow only digits
                                    const val = e.target.value.replace(/\D/g, '');
                                    setOtp(val);
                                }}
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0 text-center text-lg tracking-[0.3em]"
                                autoComplete="one-time-code"
                                disabled={loading}
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-[#FF453A]">{error}</p>
                        )}

                        {resendMessage && (
                            <p className="text-sm text-[#30D158]">{resendMessage}</p>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pt-0">
                        <Button
                            className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]"
                            type="submit"
                            disabled={loading || otp.length === 0}
                        >
                            {loading ? 'Verifying...' : 'Verify Email'}
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] hover:bg-[#242427] hover:text-[#F5F5F7]"
                            type="button"
                            onClick={handleResend}
                            disabled={resendLoading || loading}
                        >
                            {resendLoading ? 'Sending...' : 'Resend Code'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </AuthLayout>
    );
};

export default VerifyEmailPage;
