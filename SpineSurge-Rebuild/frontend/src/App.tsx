import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { router } from '@/app/router';
import { useTheme } from '@/lib/theme/useTheme';

export function App() {
  // Apply the persisted light/dark theme to <html data-theme> for the whole tree.
  useTheme();
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  );
}
