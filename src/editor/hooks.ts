/* Services the editor core needs from the outer layers (rendering, overlays,
   messages, text editing). They are wired up once in main.ts, so the editor
   never imports UI code directly. */

export const hooks = {
  /** Redraw everything from the current state. */
  render: (): void => {},
  /** The whole document was replaced (undo, open, new). */
  docReplaced: (): void => {},
  /** Recompute the pointer hover overlay. */
  refreshHover: (): void => {},
  /** Finish text editing (writes the typed text back into the document). */
  stopEditing: (): void => {},
  /** Keep the document (called after every change, with it as JSON). */
  save: (_json: string): void => {},
  /** Show a short message. */
  notify: (_message: string): void => {},
};

export const render = (): void => hooks.render();
export const notify = (message: string): void => hooks.notify(message);
