// React 19 removed the global JSX namespace; the pane sketches annotate with
// `JSX.Element` against React 18 types. Delete this shim when the pane
// components get their real bodies.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    interface Element extends ReactJSX.Element {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    interface ElementClass extends ReactJSX.ElementClass {}
  }
}

export {};
