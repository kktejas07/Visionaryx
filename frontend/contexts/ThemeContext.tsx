/**
 * ColorMode (light/dark) context with persistence.
 *
 * On web we additionally toggle `document.documentElement.dataset.vxTheme`
 * so a small CSS override can recolor the body background instantly, even
 * for components that ship their colors via static StyleSheet (RN-Web).
 *
 * The rest of the app reads `useColors()` for live palette access where it
 * has been wired up (root chrome, command background). Static palettes
 * still work for the deep dark glass cards which look consistent in either
 * mode.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { PaletteDark, PaletteLight, type Palette } from '@/constants/visionTheme';

export type ColorMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ColorMode;
  setMode: (m: ColorMode) => void;
  toggle: () => void;
  colors: Palette;
}

const STORAGE_KEY = 'vx_color_mode';
const isWeb = Platform.OS === 'web';

async function storageGet(): Promise<string | null> {
  try {
    if (isWeb) {
      return typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    }
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function storageSet(v: string): Promise<void> {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, v);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark', setMode: () => {}, toggle: () => {}, colors: PaletteDark,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>('dark');

  // Restore persisted preference.
  useEffect(() => {
    let active = true;
    storageGet().then((v) => {
      if (active && (v === 'light' || v === 'dark')) setModeState(v);
    });
    return () => { active = false; };
  }, []);

  const applyMode = useCallback((m: ColorMode) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dataset.vxTheme = m;
      document.documentElement.style.colorScheme = m;
    }
  }, []);

  useEffect(() => { applyMode(mode); }, [mode, applyMode]);

  const setMode = useCallback((m: ColorMode) => {
    setModeState(m);
    void storageSet(m);
  }, []);

  const toggle = useCallback(() => setMode(mode === 'dark' ? 'light' : 'dark'), [mode, setMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode, setMode, toggle,
    colors: mode === 'light' ? PaletteLight : PaletteDark,
  }), [mode, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useColorMode() {
  return useContext(ThemeContext);
}

export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}
