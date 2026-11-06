import { lazy } from 'react';

const RELOAD_KEY = 'dms-page-reloaded';

const readFlag = () => {
  try { return sessionStorage.getItem(RELOAD_KEY); } catch { return '1'; }
};
const writeFlag = (value) => {
  try {
    if (value) sessionStorage.setItem(RELOAD_KEY, value);
    else sessionStorage.removeItem(RELOAD_KEY);
  } catch { /* storage is blocked, so the page won't reload itself */ }
};

// Loads a page's code when it is first opened. A tab left open across a new deployment asks for
// a file that no longer exists, so it reloads once to get the new version.
export const lazyPage = (load) => lazy(async () => {
  try {
    const page = await load();
    writeFlag(null);
    return page;
  } catch (err) {
    if (readFlag()) throw err;
    writeFlag('1');
    window.location.reload();
    return new Promise(() => {});
  }
});
