// TypeScript 6 (TS2882) requires an explicit declaration for side-effect CSS
// imports; Next 14's bundled types only cover *.module.css.
declare module '*.css';
