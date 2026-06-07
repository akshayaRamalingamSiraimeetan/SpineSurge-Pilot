/* Dev-token login + org picker. In dev mode the backend mints a JWT for the chosen identity/org;
   production OIDC replaces this screen without touching the rest of the app (AuthProvider.login is
   the seam). Uses react-hook-form + zod per the stack. */
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Icon, Logo, Wordmark } from '@/components/Icon';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEV_ORGS } from '@/lib/auth/devOrgs';
import { ApiError } from '@/lib/api/client';
import type { Role } from '@/lib/api/types';

const ROLES: Role[] = ['owner', 'admin', 'surgeon', 'viewer'];

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['owner', 'admin', 'surgeon', 'viewer']),
  orgId: z.string().min(1, 'Select an organization'),
});
type FormValues = z.infer<typeof schema>;

export function LoginScreen() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'dev@spine.local', role: 'surgeon', orgId: DEV_ORGS[0].id },
  });

  // useWatch (hook-based) instead of watch() so the React Compiler lint rules stay happy.
  const orgId = useWatch({ control, name: 'orgId' });
  const role = useWatch({ control, name: 'role' });

  if (status === 'authenticated') {
    const dest = (location.state as { from?: string } | null)?.from ?? '/dashboard';
    return <Navigate to={dest} replace />;
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const org = DEV_ORGS.find((o) => o.id === values.orgId)!;
    try {
      await login({
        subject: values.email,
        email: values.email,
        role: values.role,
        orgId: org.id,
        orgName: org.name,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 404
          ? 'Dev-token auth is disabled on the backend (auth_dev_mode off).'
          : err instanceof Error
            ? `Could not reach the API: ${err.message}`
            : 'Login failed';
      setServerError(msg);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit(onSubmit)}>
        <div className="login-brand">
          <Logo size={34} />
          <Wordmark size={20} />
        </div>
        <h1>Sign in</h1>
        <p className="login-sub">Local development access · select your identity and organization.</p>

        <div className="login-field">
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" placeholder="you@hospital.org" {...register('email')} />
          {errors.email && <div className="login-error">{errors.email.message}</div>}
        </div>

        <div className="login-field">
          <label className="field-label" htmlFor="role">
            Role
          </label>
          <select id="role" className="select" {...register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="login-field">
          <span className="field-label">Organization</span>
          <div className="org-grid">
            {DEV_ORGS.map((org) => (
              <button
                key={org.id}
                type="button"
                className={'org-row' + (org.id === orgId ? ' active' : '')}
                onClick={() => setValue('orgId', org.id, { shouldValidate: true })}
              >
                <span className="avatar-initials tone-accent" style={{ width: 38, height: 38, fontSize: 14, borderRadius: 'var(--r-md)' }}>
                  <Icon name="shield" size={18} />
                </span>
                <span style={{ flex: 1 }}>
                  <span className="or-name" style={{ display: 'block' }}>
                    {org.name}
                  </span>
                  <span className="or-role" style={{ display: 'block' }}>
                    {role}
                  </span>
                </span>
                {org.id === orgId && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
          {errors.orgId && <div className="login-error">{errors.orgId.message}</div>}
        </div>

        {serverError && (
          <div className="login-error" style={{ marginBottom: 12 }}>
            {serverError}
          </div>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 44 }} disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Continue'}
          {!isSubmitting && <Icon name="arrowRight" size={17} />}
        </button>
      </form>
    </div>
  );
}
