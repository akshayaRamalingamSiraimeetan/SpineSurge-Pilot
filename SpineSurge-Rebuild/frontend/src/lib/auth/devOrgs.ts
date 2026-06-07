/* Dev-mode org catalog used by the login + org-switch screens. In production these come from the
   user's OIDC memberships (GET /auth/me); in dev mode the backend JIT-provisions an org for any
   external id we mint a token against, so this list just seeds the picker. */
export interface DevOrg {
  id: string;
  name: string;
}

export const DEV_ORGS: DevOrg[] = [
  { id: 'spine-center', name: 'Spine Center' },
  { id: 'ortho-institute', name: 'Orthopaedic Institute' },
  { id: 'metro-spine', name: 'Metro Spine Clinic' },
];
