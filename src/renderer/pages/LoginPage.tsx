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
            <Card className="w-full rounded-2xl border border-[#242427] bg-[#141416] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[#F5F5F7]">Welcome back</CardTitle>
                    <CardDescription className="text-center text-[#9CA3AF] text-sm">
                        Enter your credentials to access your workspace
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="grid gap-4 pb-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email" className="text-[#9CA3AF] text-xs tracking-wide uppercase">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="doctor@spine.com"
                                defaultValue="demo@spine.com"
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password" className="text-[#9CA3AF] text-xs tracking-wide uppercase">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                defaultValue="password"
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>
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
                                <span className="w-full border-t border-[#242427]" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-[#141416] px-3 text-[#9CA3AF] tracking-wide">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] hover:bg-[#242427] hover:text-[#F5F5F7]"
                            type="button"
                        >
                            Hospital SSO
                        </Button>
                    </CardFooter>
                </form>
            </Card>
            <div className="text-center text-sm text-[#9CA3AF]">
                <a href="#" className="underline hover:text-[#FF453A] transition-colors">
                    Forgot your password?
                </a>
            </div>
        </AuthLayout>
    );
};

export default LoginPage;
