import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const t = useTheme();
  const scheme = useColorScheme();
  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'SpineSurge Measure' }} />
        <Stack.Screen name="new" options={{ title: 'New assessment', presentation: 'modal' }} />
        <Stack.Screen name="case/[id]" options={{ title: '' }} />
      </Stack>
    </>
  );
}
