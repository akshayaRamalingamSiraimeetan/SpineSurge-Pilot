import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAppStore } from '@/lib/store/index';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Invitation {
    id:        string;
    orgId:     string;
    orgName:   string;
    role:      string;
    status:    string;
    createdAt: string;
}

/**
 * PendingInvitationsPage
 * Shows all pending invitations for the current user.
 * Multi-org aware: accepting an invitation adds the org to the user's
 * workspace switcher without removing any existing memberships.
 *
 * Route: /pending-invitations
 */
const PendingInvitationsPage = () => {
    const token         = useAppStore((state) => state.token);
    const fetchOrgLists = useAppStore((state) => state.fetchOrgLists);

    const [invitations, setInvitations]     = useState<Invitation[]>([]);
    const [loading, setLoading]             = useState(true);
    const [fetchError, setFetchError]       = useState<string | null>(null);
    const [actionErrors, setActionErrors]   = useState<Record<string, string>>({});
    const [actionPending, setActionPending] = useState<Record<string, boolean>>({});

    const fetchInvitations = async () => {
        setFetchError(null);
        setLoading(true);
        try {
            const res = await axios.get('http://localhost:3001/invitations/pending', {
                headers: { Authorization: `Bearer ${token}` },
                validateStatus: (s) => s < 500,
            });

            if (res.status === 200) {
                setInvitations(res.data ?? []);
            } else {
                setFetchError(res.data?.error ?? 'Failed to load invitations.');
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setFetchError(err.response?.data?.error ?? err.message ?? 'An unexpected error occurred.');
            } else {
                setFetchError('An unexpected error occurred.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInvitations(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAccept = async (invitationId: string) => {
        setActionErrors((prev) => ({ ...prev, [invitationId]: '' }));
        setActionPending((prev) => ({ ...prev, [invitationId]: true }));

        try {
            const res = await axios.post(
                `http://localhost:3001/invitations/${invitationId}/accept`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500,
                }
            );

            if (res.status === 200 || res.status === 201) {
                // Refresh org lists so the workspace switcher shows the new org
                await fetchOrgLists();
                // Remove from list
                setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
            } else {
                setActionErrors((prev) => ({
                    ...prev,
                    [invitationId]: res.data?.error ?? 'Failed to accept invitation.',
                }));
            }
        } catch (err: unknown) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data?.error ?? err.message ?? 'An unexpected error occurred.')
                : 'An unexpected error occurred.';
            setActionErrors((prev) => ({ ...prev, [invitationId]: message }));
        } finally {
            setActionPending((prev) => ({ ...prev, [invitationId]: false }));
        }
    };

    const handleDecline = async (invitationId: string) => {
        setActionErrors((prev) => ({ ...prev, [invitationId]: '' }));
        setActionPending((prev) => ({ ...prev, [invitationId]: true }));

        try {
            const res = await axios.post(
                `http://localhost:3001/invitations/${invitationId}/decline`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500,
                }
            );

            if (res.status === 200) {
                setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
            } else {
                setActionErrors((prev) => ({
                    ...prev,
                    [invitationId]: res.data?.error ?? 'Failed to decline invitation.',
                }));
            }
        } catch (err: unknown) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data?.error ?? err.message ?? 'An unexpected error occurred.')
                : 'An unexpected error occurred.';
            setActionErrors((prev) => ({ ...prev, [invitationId]: message }));
        } finally {
            setActionPending((prev) => ({ ...prev, [invitationId]: false }));
        }
    };

    return (
        <div className="px-8 py-12 max-w-2xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold text-[#F5F5F7] tracking-tight">
                    Pending Invitations
                </h1>
                <p className="mt-1 text-sm text-[#9CA3AF]">
                    Join additional organizations on SpineSurge.
                </p>
            </div>

            {loading && (
                <p className="text-sm text-[#9CA3AF]">Loading invitations…</p>
            )}

            {!loading && fetchError && (
                <div className="rounded-md border border-[#FF453A]/30 bg-[#FF453A]/10 px-4 py-3 text-sm text-[#FF453A]">
                    {fetchError}
                </div>
            )}

            {!loading && !fetchError && invitations.length === 0 && (
                <p className="text-sm text-[#9CA3AF]">No pending invitations found.</p>
            )}

            {!loading && !fetchError && invitations.length > 0 && (
                <div className="space-y-4">
                    {invitations.map((inv) => (
                        <Card
                            key={inv.id}
                            className="rounded-xl border border-[#242427] bg-[#141416]"
                        >
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold text-[#F5F5F7]">
                                    {inv.orgName}
                                </CardTitle>
                                <CardDescription className="text-xs text-[#9CA3AF] capitalize">
                                    Role: {inv.role}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-3">
                                {actionErrors[inv.id] && (
                                    <p className="text-sm text-[#FF453A]">{actionErrors[inv.id]}</p>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleAccept(inv.id)}
                                        disabled={actionPending[inv.id]}
                                        className="h-9 rounded-md bg-[#FF453A] text-white text-sm font-semibold hover:bg-[#e03d33]"
                                    >
                                        {actionPending[inv.id] ? 'Processing…' : 'Accept'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleDecline(inv.id)}
                                        disabled={actionPending[inv.id]}
                                        className="h-9 rounded-md border-[#242427] bg-transparent text-[#9CA3AF] text-sm hover:bg-[#242427] hover:text-[#F5F5F7]"
                                    >
                                        Decline
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PendingInvitationsPage;
