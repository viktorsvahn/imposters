import { dom } from './dom';

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string): void {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => dom.toast.classList.remove('show'), 3000);
}
