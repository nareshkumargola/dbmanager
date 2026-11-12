import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Font sizes written in px (in our CSS files and in classes like text-[11px]) are turned into rem.
// The Font size setting changes the root size, so this makes it scale every piece of text.
// At the default size 1rem is 16px, so the app looks exactly the same as with px.
const toRem = (px) => `${Number((Number.parseFloat(px) / 16).toFixed(4))}rem`;

const fontSizeToRem = () => ({
  postcssPlugin: 'font-size-to-rem',
  Declaration: {
    'font-size': (decl) => {
      decl.value = decl.value.replace(/(\d*\.?\d+)px\b/g, (_, px) => toRem(px));
    },
    // "font: 12px/1.5 monospace": only the size, which is the px value before "/" or a space
    font: (decl) => {
      decl.value = decl.value.replace(/(^|\s)(\d*\.?\d+)px(?=[\s/])/, (_, lead, px) => `${lead}${toRem(px)}`);
    },
  },
});
fontSizeToRem.postcss = true;

export default {
  plugins: [tailwindcss(), fontSizeToRem(), autoprefixer()],
};
