import { browser } from '$app/environment';

const STORAGE_KEY = 'bridge-demo-styles';

class StylesToggle {
  enabled = $state(browser ? localStorage.getItem(STORAGE_KEY) !== 'false' : false);

  toggle() {
    this.enabled = !this.enabled;
    if (browser) localStorage.setItem(STORAGE_KEY, String(this.enabled));
  }
}

export const stylesToggle = new StylesToggle();
