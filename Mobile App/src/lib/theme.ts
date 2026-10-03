import { useColorScheme } from 'react-native';

/** Same palette as the SpineSurge web app (dark first, red accent). */
const dark = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1A1A1D',
  surface3: '#202024',
  border: '#242427',
  text: '#F3F3F5',
  text2: '#A4A4AC',
  text3: '#6C6C74',
  accent: '#F23A2E',
  accentSoft: '#2A1513',
  good: '#3BD07E',
  danger: '#FF5A4D',
  /** measurement annotation colour on the image */
  annotate: '#22D3EE',
};
const light: typeof dark = {
  bg: '#F4F4F6',
  surface: '#FFFFFF',
  surface2: '#FAFAFA',
  surface3: '#F0F0F3',
  border: '#E3E3E8',
  text: '#17171A',
  text2: '#58585F',
  text3: '#8A8A93',
  accent: '#EC3327',
  accentSoft: '#FDECEA',
  good: '#15924F',
  danger: '#DC2626',
  annotate: '#0891B2',
};

export type Theme = typeof dark;
export const useTheme = (): Theme => (useColorScheme() === 'light' ? light : dark);
