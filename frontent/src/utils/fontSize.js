// Font size setting for the whole app (Settings → Appearance).
// It sets data-font-size on <html>; index.css turns that into the root font size, and every
// font size in the app is in rem (see postcss.config.js), so all text grows or shrinks together.
// Sizes are a percent of the browser's own default, so a larger browser default is kept.

export const FONT_SIZES = [
  { id: 'small', label: 'Small', percent: 87.5 },
  { id: 'default', label: 'Default', percent: 100 },
  { id: 'large', label: 'Large', percent: 112.5 },
  { id: 'xlarge', label: 'Extra large', percent: 125 },
];

const STORAGE_KEY = 'fontSize';
const isKnown = (id) => FONT_SIZES.some((size) => size.id === id);

// The last size used on this device, so the sign-in page and the first paint already use it
export const storedFontSize = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isKnown(value) ? value : 'default';
  } catch {
    return 'default';
  }
};

export const applyFontSize = (id) => {
  const size = isKnown(id) ? id : 'default';
  if (size === 'default') delete document.documentElement.dataset.fontSize;
  else document.documentElement.dataset.fontSize = size;
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Storage can be blocked; the size still applies for this visit
  }
  return size;
};
