/**
 * The theme choice, shared by the settings segment and the header toggle.
 *
 * Three values, but only two of them name a palette: 'system' means "whatever
 * the OS says right now", so it is stored as an absence of a decision rather
 * than as a palette, and the class it resolves to can change while the tab is
 * open. `public/init.js` applies the same rule before paint and keeps a
 * `prefers-color-scheme` listener attached, which is what makes an OS flip
 * land on a page nobody is touching.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'toll-e.theme';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Anything that is not an explicit palette — 'system', or nothing yet — is
 *  the system choice, which is therefore also the default. Same test init.js
 *  makes. */
export function themeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** The palette a choice resolves to right now. */
export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'system') return media().matches ? 'dark' : 'light';
  return choice;
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {}
  document.documentElement.classList.toggle('dark', resolveTheme(choice) === 'dark');
}
