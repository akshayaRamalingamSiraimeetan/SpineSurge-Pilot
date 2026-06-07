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
import { useNavigate } from "react-router-dom";

const LoginPage = () => {
    const login = useAppStore((state) => state.login);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Mock login delay
        setTimeout(() => {
            login("demo@spine.com");
            setLoading(false);
            navigate("/");
        }, 800);
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[#1E3A5F]/90 bg-[#102C48] shadow-[0_28px_70px_rgba(10,25,41,0.9),0_0_0_1px_rgba(79,195,247,0.08),0_0_36px_rgba(41,182,246,0.14)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[#E3F2FD]">Welcome back</CardTitle>
                    <CardDescription className="text-center text-[#90CAF9] text-sm">
                        Enter your credentials to access your workspace
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="grid gap-4 pb-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-[#90CAF9] text-xs tracking-wide uppercase">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="doctor@spine.com"
                                defaultValue="demo@spine.com"
                                className="h-11 rounded-md border-[#3A5A7A] bg-[#1B3F61] text-[#E3F2FD] placeholder:text-[#7EA4C7] focus-visible:ring-[#4FC3F7] focus-visible:ring-offset-0"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password" className="text-[#90CAF9] text-xs tracking-wide uppercase">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                defaultValue="password"
                                className="h-11 rounded-md border-[#3A5A7A] bg-[#1B3F61] text-[#E3F2FD] placeholder:text-[#7EA4C7] focus-visible:ring-[#4FC3F7] focus-visible:ring-offset-0"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 pt-0">
                        <Button
                            className="w-full h-11 rounded-md bg-gradient-to-r from-[#29B6F6] to-[#4FC3F7] text-[#0A1929] font-semibold hover:from-[#4FC3F7] hover:to-[#81D4FA] shadow-[0_8px_24px_rgba(41,182,246,0.35)]"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "Signing in..." : "Sign In"}
                        </Button>

                        <div className="relative w-full">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-[#1E3A5F]/90" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#102C48] px-3 text-[#607D8B] tracking-wide">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full h-11 rounded-md border-[#2B4C6D] bg-[#102B46]/80 text-[#C2E3FF] hover:bg-[#17395B] hover:text-[#E3F2FD]"
                            type="button"
                        >
                            Hospital SSO
                        </Button>
                    </CardFooter>
                </form>
            </Card>
            <div className="text-center text-sm text-[#607D8B]">
                <a href="#" className="underline hover:text-[#29B6F6] transition-colors">
                    Forgot your password?
                </a>
            </div>
        </AuthLayout>
    );
};

export default LoginPage;
