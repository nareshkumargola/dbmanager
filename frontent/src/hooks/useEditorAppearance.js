import { useState } from 'react';

// Query editor color themes (applied as CSS variables on .sql-editor-container)
export const EDITOR_THEMES = {
  midnight: { label: 'Midnight', bg: '#0f172a', gutter: '#0b1220', gutterText: '#475569', border: '#1e293b', text: '#e2e8f0', caret: '#5eead4', keyword: '#5eead4', string: '#fcd34d', number: '#c4b5fd', comment: '#64748b', selection: 'rgba(94, 234, 212, 0.25)' },
  light: { label: 'Light', bg: '#ffffff', gutter: '#f8fafc', gutterText: '#94a3b8', border: '#e2e8f0', text: '#1e293b', caret: '#0d9488', keyword: '#0d9488', string: '#b45309', number: '#7c3aed', comment: '#94a3b8', selection: 'rgba(13, 148, 136, 0.18)' },
  dracula: { label: 'Dracula', bg: '#282a36', gutter: '#21222c', gutterText: '#6272a4', border: '#343746', text: '#f8f8f2', caret: '#ff79c6', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#6272a4', selection: 'rgba(189, 147, 249, 0.3)' },
  monokai: { label: 'Monokai', bg: '#272822', gutter: '#1e1f1c', gutterText: '#75715e', border: '#3e3d32', text: '#f8f8f2', caret: '#f8f8f0', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', selection: 'rgba(73, 72, 62, 0.9)' },
  oneDark: { label: 'One Dark', bg: '#282c34', gutter: '#21252b', gutterText: '#5c6370', border: '#353b45', text: '#abb2bf', caret: '#528bff', keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', selection: 'rgba(82, 139, 255, 0.25)' },
  solarized: { label: 'Solarized', bg: '#fdf6e3', gutter: '#eee8d5', gutterText: '#93a1a1', border: '#e4dcc4', text: '#586e75', caret: '#268bd2', keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#93a1a1', selection: 'rgba(38, 139, 210, 0.18)' },
};
export const EDITOR_FONT_SIZES = [12, 13, 14, 16, 18];

const readStoredSetting = (key, fallback, isValid) => {
  try {
    const value = localStorage.getItem(key);
    return value !== null && isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const storeSetting = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the choice just won't be remembered
  }
};

// Editor theme and font size, saved per browser and shared by every query editor
export default function useEditorAppearance() {
  const [editorThemeId, setEditorThemeId] = useState(() =>
    readStoredSetting('queryEditorTheme', 'midnight', (value) => Boolean(EDITOR_THEMES[value]))
  );
  const [editorFontSize, setEditorFontSize] = useState(() =>
    Number(readStoredSetting('queryEditorFontSize', '14', (value) => EDITOR_FONT_SIZES.includes(Number(value))))
  );

  const changeEditorTheme = (themeId) => {
    setEditorThemeId(themeId);
    storeSetting('queryEditorTheme', themeId);
  };
  const changeEditorFontSize = (size) => {
    setEditorFontSize(size);
    storeSetting('queryEditorFontSize', String(size));
  };

  const editorTheme = EDITOR_THEMES[editorThemeId];
  const editorStyleVars = {
    '--ed-bg': editorTheme.bg,
    '--ed-gutter': editorTheme.gutter,
    '--ed-gutter-text': editorTheme.gutterText,
    '--ed-border': editorTheme.border,
    '--ed-text': editorTheme.text,
    '--ed-caret': editorTheme.caret,
    '--ed-keyword': editorTheme.keyword,
    '--ed-string': editorTheme.string,
    '--ed-number': editorTheme.number,
    '--ed-comment': editorTheme.comment,
    '--ed-selection': editorTheme.selection,
    '--ed-font-size': `${editorFontSize}px`,
  };

  return { editorThemeId, editorTheme, editorFontSize, editorStyleVars, changeEditorTheme, changeEditorFontSize };
}
