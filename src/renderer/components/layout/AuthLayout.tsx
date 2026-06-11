import React from 'react';
import Logo from '@/assets/Logo.png';


interface AuthLayoutProps {
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-[#0A0A0B] text-[#F5F5F7]">
            {/* Subtle dot grid — enterprise style, no neon glow */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:32px_32px]" />

            <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-10 sm:px-6">
                <div className="flex flex-col items-center space-y-3 text-center">
                    <img src={Logo} alt="SpineSurge" className="h-20 w-auto sm:h-24 dark:brightness-100 brightness-0" />
                    <p className="text-xs text-[#9CA3AF] sm:text-sm">
                        Enter your credentials to access the workspace
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
