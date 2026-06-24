/*
 * Demo-only UI state: theme + persona. Kept out of the SDK surface — this is
 * harness chrome, not part of what a consumer integrates.
 *
 * - theme  → drives `data-theme` on <html> (see design/tokens.css).
 * - persona → published to the flag pipeline via `bridge.attributes.set`, so
 *   rule-based flags that target `app.persona` actually change behaviour live.
 *   This is a real attribute write, not a cosmetic toggle: the authenticated
 *   user's *verified* role still comes from the JWT — persona layers an
 *   app-supplied attribute on top for demonstrating attribute-driven gating.
 */

export type Theme = 'light' | 'dark';

export interface Persona {
  id: string;
  label: string;
  /** What this persona is meant to demonstrate. */
  blurb: string;
}

export const PERSONAS: Persona[] = [
  { id: 'owner', label: 'Owner', blurb: 'Full access — admin + billing + all features.' },
  { id: 'member', label: 'Member', blurb: 'Standard seat — gated out of admin/billing.' },
  { id: 'billing_owner', label: 'Billing owner', blurb: 'Manages the subscription, not the team.' },
];

const THEME_KEY = 'demo:theme';
const PERSONA_KEY = 'demo:persona';

function initialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

function initialPersona(): string {
  if (typeof localStorage === 'undefined') return PERSONAS[0].id;
  return localStorage.getItem(PERSONA_KEY) ?? PERSONAS[0].id;
}

class DemoState {
  theme = $state<Theme>(initialTheme());
  personaId = $state<string>(initialPersona());

  get persona(): Persona {
    return PERSONAS.find((p) => p.id === this.personaId) ?? PERSONAS[0];
  }

  applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  setTheme(t: Theme) {
    this.theme = t;
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, t);
    this.applyTheme();
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setPersona(id: string) {
    this.personaId = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(PERSONA_KEY, id);
  }
}

export const demoState = new DemoState();
