'use client';

import { useTheme, themes } from '@/lib/theme';

export function ThemeSettings() {
  const { themeName, setTheme, availableThemes } = useTheme();

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-secondary">
        Choose your preferred color theme for the application and terminal.
      </p>

      <div className="grid grid-cols-1 gap-2">
        {availableThemes.map((name) => {
          const theme = themes[name];
          const isSelected = name === themeName;

          return (
            <button
              key={name}
              onClick={() => setTheme(name)}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left
                ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border-secondary bg-background-tertiary'
                }`}
            >
              {/* Color preview circles */}
              <div className="flex gap-1.5">
                <span
                  className="w-5 h-5 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: theme.colors.background }}
                  title="Background"
                />
                <span
                  className="w-5 h-5 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: theme.colors.primary }}
                  title="Primary"
                />
                <span
                  className="w-5 h-5 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: theme.colors.success }}
                  title="Success"
                />
                <span
                  className="w-5 h-5 rounded-full border border-border shadow-sm"
                  style={{ backgroundColor: theme.colors.error }}
                  title="Error"
                />
              </div>

              <div className="flex-1">
                <span
                  className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}
                >
                  {theme.displayName}
                </span>
              </div>

              {isSelected && (
                <span className="text-xs text-primary font-medium px-2 py-0.5 rounded bg-primary/10">
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-medium text-foreground mb-2">Preview</h4>
        <div
          className="p-3 rounded-lg border border-border font-mono text-sm"
          style={{
            backgroundColor: themes[themeName].terminal.background,
            color: themes[themeName].terminal.foreground,
          }}
        >
          <div>
            <span style={{ color: themes[themeName].terminal.green }}>user@session-hub</span>
            <span style={{ color: themes[themeName].terminal.foreground }}>:</span>
            <span style={{ color: themes[themeName].terminal.blue }}>~</span>
            <span style={{ color: themes[themeName].terminal.foreground }}>$ </span>
            <span>claude code</span>
          </div>
          <div className="mt-1">
            <span style={{ color: themes[themeName].terminal.yellow }}>Starting session...</span>
          </div>
          <div className="mt-1">
            <span style={{ color: themes[themeName].terminal.cyan }}>Ready.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
