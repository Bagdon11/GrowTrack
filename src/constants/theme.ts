/**
 * Centralised design tokens for GrowTrack.
 * Import Colors / Spacing from here instead of using raw hex strings.
 */
export const Colors = {
  /** Brand green — primary actions, headers, FAB */
  primary: '#2E7D32',
  /** Deeper green — headings, dark text on light backgrounds */
  primaryDark: '#1B5E20',
  /** Soft green — secondary accents, tab bar active */
  secondary: '#81C784',
  /** Page background — very light green tint */
  background: '#F1F8E9',
  /** Card / surface background */
  surface: '#FFFFFF',
  /** Text on primary-coloured surfaces */
  onPrimary: '#FFFFFF',
  /** Muted grey for hints / subtitles */
  muted: '#666666',
  /** Divider / border grey */
  border: '#E0E0E0',
} as const;

/** Season chip background colours */
export const SeasonColors: Record<string, string> = {
  spring: '#C8E6C9',
  summer: '#FFECB3',
  autumn: '#FFE0B2',
  winter: '#BBDEFB',
  fruit: '#FCE4EC',
};

/** React Native Paper MD3 theme override */
export const paperTheme = {
  colors: {
    primary: Colors.primary,
    secondary: Colors.secondary,
    background: Colors.background,
    surface: Colors.surface,
    onPrimary: Colors.onPrimary,
  },
};
