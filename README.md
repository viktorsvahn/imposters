# Imposters

*(Im)ages and (posters)* — a tile-based poster editor that runs in the browser.

Divide the page into tiles, divide tiles into smaller tiles, and fill them with text and images. Layout snaps to
margins, gutters and other tiles, and the poster prints to PDF at its true size.

---

## Getting started

You need [Node.js](https://nodejs.org) 18 or newer to build the app. Don't use `apt install nodejs` — Ubuntu's
version is too old. Install it with [nvm](https://github.com/nvm-sh/nvm) instead:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then:
nvm install --lts
node --version     # v18 or newer
```

Then, in the project folder:

```sh
npm install        # once
npm run build      # creates dist/index.html
xdg-open dist/index.html     # or open it in your browser (WSL: explorer.exe dist/index.html)
```

`dist/index.html` is a single self-contained file — no server needed.

> **WSL tip:** keep the project in your Linux home folder rather than on `/mnt/c` — installing and building is much faster there.

---

## Manual

### The basics

* The page starts with a **header** (with the title) and a **footer**. The area between them, inside the margins, is where your tiles go.
* **+ Text** / **+ Image** add a tile that fills the largest empty area. You can also **drag on empty paper** to draw a tile.
* **Click a tile** to select it. **Drag** to move it, or drag its **handles** to resize. Tiles snap to margins, gutters and each other (hold **Alt** to turn snapping off).
* **Drag the gap** between two tiles to resize both at once.

### Splitting tiles

* Hold **Shift** and point at a tile edge — a **+** slides along it. **Click** to split the tile there:
  * a **+** on the right/left edge splits it into **upper and lower** tiles,
  * on the bottom/top edge into **left and right** tiles.
* The cut snaps to **½, ⅓, ¼** of the tile and to lines continuing other tiles' edges.
* **Ctrl+Shift** splits into **equal parts** — as many as the **Parts** box says (or press **2–9**).
* **Split ◫ / Split ⊟** in the toolbar do the same for the selected tile.
* In **headers and footers** the cut snaps to **squares** (for logos) and **middles**, and the header stays one coloured band.
* **Fill** grows a tile into the free space around it; **Fill gaps** closes all gaps.

### Tiles inside tiles

* **Double-click** a divided tile, or select a tile and press **E** / **Enter ⤵** (or **Ctrl+Enter**), to **go inside** it.
  Everything outside is dimmed and you can create and split tiles there just like on the page.
* **Esc**, a click outside, or the **breadcrumbs** (*Poster › …*) take you back out.
* Each divided tile has its own **inner margin** and **gutter** (in the settings panel); its tiles reflow when it is resized.

### Text

* **Click text to start typing** — anywhere, even inside divided tiles. **Esc** stops typing.
* The **formatting toolbar** (second row) works like a word processor:
  * **text style** (Title, Subtitle, Body, Heading 1–5 and your own), font, size, **B** *I* <u>U</u>, text colour,
  * alignment (left / centre / right / justify), vertical position in the tile, bullet and numbered lists,
  * line spacing ↕, space after paragraphs ¶, text columns ▥, **Clear** formatting.
* While typing it styles the paragraph or selected text; with tiles selected it styles the whole tiles.

### Colours, borders, headers & footers

* **Fill** (bucket button) and **text colour** offer the design colours, your **recent colours** and a custom picker.
* **Border** — sides, width, colour and rounded corners.
* **Header / Footer** — add or remove a band at the top/bottom of the selected tile (or of the poster).
* **Bleed** — the background runs past the margin to the edge, while the text stays inside the margin.

### Design (master settings)

Click **Design** to set the colours and text styles for the whole poster:

* **Colours** for paper, tiles, poster header/footer and tile headers/footers. Everything using them updates when you change them.
* **Text styles** — tick which ones are offered, rename them, change font, size, weight and colour, or add your own with **+ Add text style**.

### Images

Drop or paste an image onto the page or onto a tile, or select an image tile and press **Enter**.

### Saving and printing

* Your poster **autosaves** in the browser.
* **Save** downloads a `.json` file; **Open** (or dropping a `.json` file) loads one.
* **PDF / Print** prints exactly the paper — choose *Save as PDF* in the print dialog.
* Paper size, orientation, margins, gutter and column guides are in the **⚙ Panel**.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Shift (hold) | show split points on tile edges |
| Ctrl+Shift (hold) | split into equal parts |
| 2 – 9 | number of equal parts |
| T / I | add text / image tile |
| V / H | split selected tile into columns / rows |
| F | fill free space |
| E, Ctrl+Enter | go inside the selected tile |
| Enter | type in / choose image for the selected tile |
| Esc | stop typing · deselect · go back out |
| Arrows | nudge 1 mm (Shift: 10 mm) · Alt+arrows: grow |
| Delete | delete selected tiles |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+D | duplicate |
| Ctrl+S / Ctrl+O | save / open |
| Ctrl+scroll, + / − / 0 | zoom · fit page |

---

## Development

```sh
npm run dev        # live-reloading dev server at http://localhost:5173
npm run build      # type-check + build dist/index.html
npm test           # unit tests (layout rules and document model)
npm run test:e2e   # build, then drive the app in Chrome (set CHROME_PATH if it isn't found)
```

To deploy, publish `dist/` (it is just `index.html`) on any static host.

### Project structure

```
index.html            page skeleton: toolbar, stage, settings panel
src/
  main.ts             entry point: wires the layers together
  commands.ts         named commands for toolbar buttons and shortcuts
  model/              the document: types, tiles, tree helpers, design, styling rules
  layout/             layout rules (pure functions): snapping, free space, cuts, seams,
                      reflow, headers/footers, bleed, containers, paper resize
  editor/             editor state, undo history + autosave, preferences, document commands
  view/               drawing: paper & tiles, overlays, design CSS & fonts, messages
  interaction/        pointer, typing, hover, keyboard, files, zoom
  ui/                 formatting toolbar, menus, main toolbar, settings panel, design tab
  styles/             CSS by area
tests/unit/           Vitest — model and layout rules
tests/e2e/            node:test + puppeteer-core — the built app with real input
```

Dependencies point one way: `model ← layout ← editor ← view / interaction / ui ← main`.
`model/` and `layout/` never touch the DOM, so they can be unit-tested; the editor reaches the outer layers only
through `editor/hooks.ts`.

**Key ideas:** all geometry is in millimetres (the paper renders at true size and is zoomed with a transform);
a tile with `children` is a container laid out inside its inner margin; the editor works on one *level*
(`editor.view.scope`) at a time; colours are `#hex`, `""` or `@role` (linked to the design); text styles are
applied with `data-ts`; every completed change calls `commit()` (undo step + autosave).

**Adding things:** a toolbar command → `data-act` button + `src/commands.ts`; a formatting control →
`src/ui/formatbar.ts`; a tile property → `model/types.ts`, `makeTile()`, `updateTileEl()`; a layout rule → a pure
function in `layout/` with a unit test.

`window.imposters` exposes the editor state for debugging and the browser tests.
