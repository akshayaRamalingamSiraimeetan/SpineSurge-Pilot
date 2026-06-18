import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAppStore } from '@/lib/store/index';
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
import { Button } from '@/components/ui/button';

/**
 * CreateOrgPage
 * Accessible from the Workspace Switcher (slide-out panel).
 * Organisation creation is OPTIONAL — users already have a Personal Workspace.
 *
 * Label:
 *   createdOrgs.length === 0 → "Create Organization"
 *   createdOrgs.length  >  0 → "Add Organization"
 */
const CreateOrgPage = () => {
    const token              = useAppStore((state) => state.token);
    const createdOrgs        = useAppStore((state) => state.createdOrgs);
    const setToken           = useAppStore((state) => state.setToken);
    const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
    const fetchOrgLists      = useAppStore((state) => state.fetchOrgLists);
    const navigate           = useNavigate();

    const isFirstOrg = createdOrgs.length === 0;
    const heading    = isFirstOrg ? 'Create Organization' : 'Add Organization';

    const [name, setName]   = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await axios.post(
                'http://localhost:3001/orgs',
                { name, organizationEmail: email },
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500,
                }
            );

            if (res.status === 200 || res.status === 201) {
                if (res.data?.token) {
                    setToken(res.data.token);
                }
                if (res.data?.org?.id) {
                    setActiveWorkspace({ type: 'organization', orgId: res.data.org.id });
                }
                // Refresh org lists so workspace switcher shows the new org
                await fetchOrgLists();
                navigate('/dashboard');
            } else {
                setError(res.data?.error ?? 'Failed to create organization. Please try again.');
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.error ?? err.message ?? 'An unexpected error occurred.');
            } else {
                setError('An unexpected error occurred.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-full min-h-screen items-center justify-center px-4 py-12">
            <Card className="w-full max-w-md rounded-2xl border border-[#242427] bg-[#141416] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)]">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-2xl font-semibold text-[#F5F5F7] tracking-tight">
                        {heading}
                    </CardTitle>
                    <CardDescription className="text-[#9CA3AF] text-sm">
                        Create a healthcare planning and research organization.
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="grid gap-4 pb-4">
                        {error && (
                            <div className="rounded-md border border-[#FF453A]/30 bg-[#FF453A]/10 px-4 py-3 text-sm text-[#FF453A]">
                                {error}
                            </div>
                        )}

                        <div className="grid gap-2">
                            <Label
                                htmlFor="org-name"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Organization Name
                            </Label>
                            <Input
                                id="org-name"
                                type="text"
                                placeholder="Acme Healthcare"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label
                                htmlFor="org-email"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Organization Email
                            </Label>
                            <Input
                                id="org-email"
                                type="email"
                                placeholder="admin@acme-health.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>
                    </CardContent>

                    <CardFooter className="pt-0">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]"
                        >
                            {loading ? 'Creating...' : heading}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
};

export default CreateOrgPage;
