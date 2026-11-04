import { useState } from 'react';
import { EDITOR_FONT_SIZES, EDITOR_THEMES } from '../hooks/useEditorAppearance';

// Toolbar button + menu for the query editor theme and font size
export default function EditorThemeMenu({ appearance }) {
  const { editorThemeId, editorTheme, editorFontSize, changeEditorTheme, changeEditorFontSize } = appearance;
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        title="Editor theme & font size"
        aria-expanded={open}
        className={`cd-qe-tool ${open ? 'is-active' : ''}`}
      >
        <span className="cd-qe-swatch" style={{ background: editorTheme.bg, borderColor: editorTheme.border }}>
          <span style={{ background: editorTheme.keyword }} />
        </span>
        Theme
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close theme menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="cd-qe-menu">
            <p className="cd-qe-menu-label">Editor theme</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(EDITOR_THEMES).map(([themeId, theme]) => (
                <button
                  key={themeId}
                  type="button"
                  onClick={() => changeEditorTheme(themeId)}
                  className={`cd-qe-theme ${editorThemeId === themeId ? 'is-active' : ''}`}
                >
                  <span className="cd-qe-theme-preview" style={{ background: theme.bg, borderColor: theme.border }}>
                    <span style={{ background: theme.keyword }} />
                    <span style={{ background: theme.string }} />
                    <span style={{ background: theme.number }} />
                  </span>
                  {theme.label}
                </button>
              ))}
            </div>
            <p className="cd-qe-menu-label mt-3">Font size</p>
            <div className="cd-seg w-full">
              {EDITOR_FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => changeEditorFontSize(size)}
                  className={`flex-1 ${editorFontSize === size ? 'is-active' : ''}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
