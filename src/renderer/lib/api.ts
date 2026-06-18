import { Patient, Visit, Scan, Study, Context } from './store/types';

// Determine API_BASE dynamically for Dev vs Prod/Server
const isLocalDevHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const rawApiUrl = import.meta.env.VITE_API_URL ||
    (isLocalDevHost ? 'http://localhost:3001' : window.location.origin);

export const API_BASE = (rawApiUrl && !rawApiUrl.startsWith('http'))
    ? `https://${rawApiUrl}`
    : rawApiUrl;

/**
 * Workspace context passed to data-fetching calls.
 * personal     → only caller's own studies with organization_id IS NULL
 * organization → studies with organization_id = orgId
 *                (members: only own; admins: all)
 */
export type WorkspaceContext =
    | { type: 'personal' }
    | { type: 'organization'; orgId: string };

/** Build auth header object from token */
function authHeader(token: string | null): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
    /**
     * Fetch all patients with workspace-scoped study filtering.
     * Requires auth token — server enforces ownership rules.
     */
    async getPatients(workspace?: WorkspaceContext, token?: string | null): Promise<Patient[]> {
        let url = `${API_BASE}/api/patients`;
        if (workspace) {
            const params = new URLSearchParams();
            params.set('workspace', workspace.type);
            if (workspace.type === 'organization') {
                params.set('orgId', workspace.orgId);
            }
            url += `?${params.toString()}`;
        }
        const response = await fetch(url, {
            headers: { ...authHeader(token ?? null) },
        });
        if (!response.ok) throw new Error('Failed to fetch patients');
        return response.json();
    },

    async savePatient(patient: Patient, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify(patient),
        });
        if (!response.ok) throw new Error('Failed to save patient');
        return response.json();
    },

    async saveVisit(patientId: string, visit: Visit, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/visits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify({ ...visit, patientId }),
        });
        if (!response.ok) throw new Error('Failed to save visit');
        return response.json();
    },

    async deleteVisit(visitId: string, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/visits/${visitId}`, {
            method: 'DELETE',
            headers: { ...authHeader(token ?? null) },
        });
        if (!response.ok) throw new Error('Failed to delete visit');
        return response.json();
    },

    /**
     * Save a study. Requires auth — server stamps owner_user_id immutably.
     * organizationId is set by the caller based on active workspace.
     */
    async saveStudy(study: Study, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/studies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify({
                ...study,
                organizationId: study.organizationId ?? null,
            }),
        });
        if (!response.ok) throw new Error('Failed to save study');
        return response.json();
    },

    async uploadScan(studyId: string, scan: Omit<Scan, 'imageUrl'>, file: File, token?: string | null): Promise<{ success: boolean; imageUrl: string }> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id', scan.id || Date.now().toString());
        formData.append('studyId', studyId);
        formData.append('type', scan.type);
        formData.append('date', scan.date);

        const response = await fetch(`${API_BASE}/api/scans`, {
            method: 'POST',
            headers: { ...authHeader(token ?? null) },
            body: formData,
        });
        if (!response.ok) throw new Error('Failed to upload scan');
        return response.json();
    },

    async importFolder(folderPath: string, patientId?: string, visitId?: string, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify({ folderPath, patientId, visitId }),
        });
        if (!response.ok) throw new Error('Failed to import folder');
        return response.json();
    },

    async uploadReport(visitId: string, file: Blob, title: string, token?: string | null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('visitId', visitId);
        formData.append('title', title);
        formData.append('id', `rep-${Date.now()}`);

        const response = await fetch(`${API_BASE}/api/reports`, {
            method: 'POST',
            headers: { ...authHeader(token ?? null) },
            body: formData,
        });
        if (!response.ok) throw new Error('Failed to upload report');
        return response.json();
    },

    async getReports(visitId: string, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/reports/${visitId}`, {
            headers: { ...authHeader(token ?? null) },
        });
        if (!response.ok) throw new Error('Failed to fetch reports');
        return response.json();
    },

    async getContexts(patientId: string, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/contexts/${patientId}`, {
            headers: { ...authHeader(token ?? null) },
        });
        if (!response.ok) throw new Error('Failed to fetch contexts');
        return response.json();
    },

    async saveContext(context: Context & { state?: any }, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/contexts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify(context),
        });
        if (!response.ok) throw new Error('Failed to save context');
        return response.json();
    },

    async archivePatient(patientId: string, archived: boolean, token?: string | null) {
        const response = await fetch(`${API_BASE}/api/patients/${patientId}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token ?? null) },
            body: JSON.stringify({ archived }),
        });
        if (!response.ok) throw new Error('Failed to archive patient');
        return response.json();
    },
};
