export const Colors = {
  primary: '#ff6b35',
  primaryLight: '#fff0eb',
  background: '#f0f2f5',
  surface: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  border: '#e5e7eb',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  dark: '#111827',
} as const;

export const Spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const;

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 9999,
} as const;

export const Typography = {
  h1: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.text },
  h2: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text },
  h3: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  body: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },
  bodyMedium: { fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.text },
  caption: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
} as const;
