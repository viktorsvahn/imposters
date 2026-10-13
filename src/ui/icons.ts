/* Toolbar icons (16×16, drawn with currentColor). */

const svg = (body: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;
const line = (x1: number, x2: number, y: number) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}"/>`;
const dot = (cy: number) => `<circle cx="3" cy="${cy}" r="1.2" fill="currentColor" stroke="none"/>`;

export const icons = {
  fill: svg('<path d="M3 9l5-6 5 6-5 5z" fill="none"/>'),
  alignLeft: svg(line(2, 14, 3) + line(2, 10, 6.5) + line(2, 14, 10) + line(2, 9, 13.5)),
  alignCenter: svg(line(2, 14, 3) + line(4, 12, 6.5) + line(2, 14, 10) + line(5, 11, 13.5)),
  alignRight: svg(line(2, 14, 3) + line(6, 14, 6.5) + line(2, 14, 10) + line(7, 14, 13.5)),
  alignJustify: svg(line(2, 14, 3) + line(2, 14, 6.5) + line(2, 14, 10) + line(2, 14, 13.5)),
  valignTop: svg(line(2, 14, 2) + '<rect x="5" y="4" width="6" height="5" fill="currentColor" stroke="none"/>'),
  valignMiddle: svg(line(2, 14, 8) + '<rect x="5" y="5" width="6" height="6" fill="none"/>'),
  valignBottom: svg(line(2, 14, 14) + '<rect x="5" y="7" width="6" height="5" fill="currentColor" stroke="none"/>'),
  bullets: svg(dot(4) + dot(8) + dot(12) + line(6, 14, 4) + line(6, 14, 8) + line(6, 14, 12)),
  numbers: svg('<text x="1" y="6" font-size="5" fill="currentColor" stroke="none">1</text>' +
    '<text x="1" y="13" font-size="5" fill="currentColor" stroke="none">2</text>' + line(6, 14, 4) + line(6, 14, 11)),
  header: svg('<rect x="2" y="2" width="12" height="12" rx="1" fill="none"/><rect x="2" y="2" width="12" height="4" fill="currentColor" stroke="none"/>'),
  footer: svg('<rect x="2" y="2" width="12" height="12" rx="1" fill="none"/><rect x="2" y="10" width="12" height="4" fill="currentColor" stroke="none"/>'),
  border: svg('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke-dasharray="2 1.5"/><line x1="2.5" x2="13.5" y1="13.5" y2="13.5" stroke-width="2.4"/>'),
  bleed: svg('<rect x="4" y="5" width="8" height="6" fill="currentColor" stroke="none"/>' + line(1, 4, 8) + line(12, 15, 8) +
    '<line x1="1" x2="1" y1="5" y2="11"/><line x1="15" x2="15" y1="5" y2="11"/>'),
};
