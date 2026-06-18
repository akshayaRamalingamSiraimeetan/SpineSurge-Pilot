import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';
import { ChevronDown, ChevronRight, Home } from 'lucide-react';
import { useEffect } from 'react';

const OnboardingHubPage = () => {
    const orgId = useAppStore((state) => state.orgId);
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        if (orgId) {
            navigate('/dashboard', { replace: true });
        }
    }, [orgId, navigate]);

    return (
        <div className="flex h-screen w-screen bg-[#0A0A0B] overflow-hidden">
            {/* Left Sidebar */}
            <aside className="w-60 flex-shrink-0 bg-[#141416] border-r border-[#242427] flex flex-col">
                <div className="px-4 py-5 border-b border-[#242427]">
                    <span className="text-[#F5F5F7] font-semibold text-sm tracking-wide">
                        SpineSurge
                    </span>
                </div>

                <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                    {/* Home item — toggles sub-items */}
                    <div>
                        <button
                            onClick={() => setSidebarOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[#F5F5F7] hover:bg-[#242427] transition-colors text-sm font-medium"
                        >
                            <span className="flex items-center gap-2">
                                <Home className="h-4 w-4 text-[#9CA3AF]" />
                                Home
                            </span>
                            {sidebarOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
                            )}
                        </button>

                        {/* Sub-items */}
                        {sidebarOpen && (
                            <div className="ml-4 mt-1 space-y-1 border-l border-[#242427] pl-3">
                                <Link
                                    to="/onboarding/create-org"
                                    className="block px-3 py-2 rounded-md text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors text-sm"
                                >
                                    Create Organization
                                </Link>
                                <Link
                                    to="/onboarding/invitations"
                                    className="block px-3 py-2 rounded-md text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors text-sm"
                                >
                                    Pending Invitations
                                </Link>
                            </div>
                        )}
                    </div>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto bg-[#0A0A0B]">
                <Outlet />
            </main>
        </div>
    );
};

export default OnboardingHubPage;
