/* The live view: the poster as it will be published (the HTML page of
   view/publish.ts), next to the editor and following every change — like the
   PDF pane of a LaTeX editor, but the page is live: hover over the plots.
   A changed poster swaps the paper inside the page (keeping the scroll); a
   changed look (styles, fonts) loads the page anew. */

import { loadPrefs, savePrefs } from '../editor/prefs';
import { editor } from '../editor/store';
import { project } from '../project/session';
import { $ } from '../view/dom';
import { pageHead, posterMarkup, publishHtml } from '../view/publish';

const lv = {
  open: false,
  head: '',
  /** the paper last put into the page */
  paper: '',
  timer: 0 as ReturnType<typeof setTimeout> | 0,
  busy: false,
};

const frame = (): HTMLIFrameElement => $<HTMLIFrameElement>('#liveFrame');

/** Bring the page up to date with the poster. */
async function refresh(): Promise<void> {
  if (!lv.open || !project.poster) return;
  if (editor.view.drag) { schedule(); return; } // after the drag
  const title = project.poster.name, head = pageHead(title), doc = frame().contentDocument;
  const sizer = doc?.querySelector('.sizer'), paper = posterMarkup();
  if (head === lv.head && sizer) {
    if (paper === lv.paper) return; // nothing changed
    lv.paper = paper;
    sizer.innerHTML = paper;
    (frame().contentWindow as (Window & { imposterFit?: () => void }) | null)?.imposterFit?.();
    return;
  }
  if (lv.busy) { schedule(); return; }
  lv.busy = true;
  const scroll = doc?.scrollingElement ? [doc.scrollingElement.scrollLeft, doc.scrollingElement.scrollTop] : [0, 0];
  lv.head = head;
  lv.paper = paper;
  const f = frame();
  f.onload = () => {
    lv.busy = false;
    f.contentDocument?.scrollingElement?.scrollTo(scroll[0], scroll[1]);
  };
  f.srcdoc = await publishHtml(title, false);
}

function schedule(): void {
  clearTimeout(lv.timer || undefined);
  lv.timer = setTimeout(() => void refresh(), 250);
}

/** Called after every redraw of the editor. */
export function updateLiveView(): void {
  if (lv.open) schedule();
}

function setOpen(open: boolean): void {
  lv.open = open;
  $('#liveView').hidden = !open;
  $('#liveSplit').hidden = !open;
  $('#liveBtn').classList.toggle('on', open);
  savePrefs({ live: open });
  if (open) { lv.head = ''; void refresh(); }
  else frame().srcdoc = '';
}

export function bindLiveView(): void {
  const prefs = loadPrefs();
  $('#liveView').style.width = prefs.liveWidth + 'px';
  $('#liveBtn').addEventListener('click', () => setOpen(!lv.open));
  setOpen(prefs.live);

  // drag the divider to resize
  const split = $('#liveSplit');
  split.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    const view = $('#liveView'), x0 = e.clientX, w0 = view.offsetWidth;
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      view.style.width = Math.max(240, Math.min(innerWidth - 360, w0 - (ev.clientX - x0))) + 'px';
      (frame().contentWindow as (Window & { imposterFit?: () => void }) | null)?.imposterFit?.();
    };
    const up = () => {
      split.removeEventListener('pointermove', move);
      document.body.classList.remove('resizing');
      savePrefs({ liveWidth: view.offsetWidth });
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up, { once: true });
  });
}
