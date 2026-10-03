import React from 'react';


interface AuthLayoutProps {
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
            {/* Subtle dot grid — enterprise style, no neon glow */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:32px_32px]" />

            <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-10 sm:px-6">
                <div className="flex flex-col items-center space-y-3 text-center">
                    <img src="/spinesurge.png" alt="" className="h-16 w-auto sm:h-20 select-none" draggable={false} />
                    <div className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">SpineSurge</div>
                    <p className="text-xs text-[var(--text-2)] sm:text-sm">
                        Enter your credentials to access the workspace
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
