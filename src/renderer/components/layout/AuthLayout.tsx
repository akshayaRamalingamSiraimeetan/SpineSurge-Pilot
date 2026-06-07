import React from 'react';
import Logo from '@/assets/Logo.png';


interface AuthLayoutProps {
    children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-[#07182A] text-[#E3F2FD]">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-24 left-1/2 h-[340px] w-[340px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(41,182,246,0.22),rgba(41,182,246,0)_70%)]" />
                <div className="absolute inset-x-0 top-0 h-full bg-[linear-gradient(180deg,#061324_0%,#041423_45%,#031120_100%)]" />
                <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(126,164,199,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(126,164,199,0.15)_1px,transparent_1px)] [background-size:56px_56px]" />
            </div>

            <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-10 sm:px-6">
                <div className="flex flex-col items-center space-y-3 text-center">
                    <img src={Logo} alt="SpineSurge" className="h-20 w-auto sm:h-24" />
                    <p className="text-xs text-[#90CAF9] sm:text-sm">
                        Enter your credentials to access the workspace
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
