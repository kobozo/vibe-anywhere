// Theme type definitions

export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  backgroundInput: string;

  // Borders
  border: string;
  borderSecondary: string;

  // Text
  foreground: string;
  foregroundSecondary: string;
  foregroundTertiary: string;

  // Primary (accent)
  primary: string;
  primaryHover: string;
  primaryForeground: string;

  // Semantic colors
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  error: string;
  errorForeground: string;

  // Selection/focus
  selection: string;
  focus: string;

  // Scrollbar
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
}

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface AppTheme {
  name: string;
  displayName: string;
  colors: ThemeColors;
  terminal: TerminalTheme;
}
