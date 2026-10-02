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
        <div className="flex h-screen w-screen bg-[var(--bg)] overflow-hidden">
            {/* Left Sidebar */}
            <aside className="w-60 flex-shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col">
                <div className="px-4 py-5 border-b border-[var(--border)]">
                    <span className="text-[var(--text)] font-semibold text-sm tracking-wide">
                        SpineSurge
                    </span>
                </div>

                <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                    {/* Home item — toggles sub-items */}
                    <div>
                        <button
                            onClick={() => setSidebarOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors text-sm font-medium"
                        >
                            <span className="flex items-center gap-2">
                                <Home className="h-4 w-4 text-[var(--text-2)]" />
                                Home
                            </span>
                            {sidebarOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-[var(--text-2)]" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-2)]" />
                            )}
                        </button>

                        {/* Sub-items */}
                        {sidebarOpen && (
                            <div className="ml-4 mt-1 space-y-1 border-l border-[var(--border)] pl-3">
                                <Link
                                    to="/onboarding/create-org"
                                    className="block px-3 py-2 rounded-md text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors text-sm"
                                >
                                    Create Organization
                                </Link>
                                <Link
                                    to="/onboarding/invitations"
                                    className="block px-3 py-2 rounded-md text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors text-sm"
                                >
                                    Pending Invitations
                                </Link>
                            </div>
                        )}
                    </div>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto bg-[var(--bg)]">
                <Outlet />
            </main>
        </div>
    );
};

export default OnboardingHubPage;
