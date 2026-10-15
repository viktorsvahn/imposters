# Imposters

*(Im)ages and (posters)* — a tile-based poster editor for Windows, macOS and Linux. Your work lives in a
**project folder**: several poster variants side by side, with their images.

Divide the page into tiles, divide tiles into smaller tiles, and fill them with text and images. Layout snaps to
margins, gutters and other tiles, and the poster prints to PDF at its true size.

---

## Getting started

You need [Node.js](https://nodejs.org) 18 or newer to build the app (people who only use a packaged app don't).

* **Windows:** `winget install OpenJS.NodeJS.LTS`, or the installer from nodejs.org.
* **macOS / Linux:** the installer from nodejs.org, or [nvm](https://github.com/nvm-sh/nvm). (Don't use
  `apt install nodejs` — Ubuntu's version is too old.)

Then, in the project folder:

```sh
npm install        # once
npm run app        # build and start the desktop app
```

The first start shows **New project… / Open project…**. A new project is a folder you choose; from then on the app
reopens the last project. You can also start it on a folder: `npm run app -- "path/to/My project"`.

> **WSL:** run npm from Windows (e.g. a PowerShell or `cmd` window), so the app opens as a normal Windows window.

The same editor also runs in a plain browser (`npm run build`, then open `dist/index.html`): it then keeps one
built-in project in the browser's storage, with images stored inside the poster.

---

## Manual

### The basics

* The page starts with a **header** (with the title) and a **footer**. The area between them, inside the margins, is where your tiles go.
* **+ Text** / **+ Image** add a tile that fills the largest empty area (a new text tile is ready to type in). You can also **drag on empty paper** to draw a tile.
* Edges snap to margins, columns, other tiles, the gutter — and, inside a tile, to the lines of neighbouring tiles
  (a header lines up with the header of the tile next to it).
* **Click a tile** to select it. **Drag** to move it, or drag its **handles** to resize. Tiles snap to margins, gutters and each other (hold **Alt** to turn snapping off).
* **Drag the gap** between two tiles to resize both at once. **Ctrl+Alt**-drag it to open space between them
  symmetrically (drag right/down to widen, left/up to narrow); **Ctrl+Alt+Shift**-drag opens the same space between
  all tiles in that tile along that direction.

### Splitting tiles

* Hold **Ctrl+Shift** and point at a tile edge — a **+** slides along it. **Click** to split the tile there:
  * a **+** on the right/left edge splits it into **upper and lower** tiles,
  * on the bottom/top edge into **left and right** tiles.
* The cut snaps to **½, ⅓, ¼** of the tile and to lines continuing other tiles' edges.
* **Ctrl+Alt+Shift** splits into **equal parts** — as many as the **Parts** box says (or press **2–9**).
* **Shift** alone is for selecting: **Shift-click** tiles to select several (to merge, align, …).
* **Split ◫ / Split ⊟** in the toolbar do the same for the selected tile.
* In **headers and footers** the cut snaps to **squares** (for logos) and **middles**, and the header stays one coloured band.
* **Fill** grows a tile into the free space around it; **Fill gaps** closes all gaps.
* **Merge** (M): select two or more tiles (Shift-click) and they become **one tile with them inside it** — each keeps
  its content (and its own divisions), and they now touch, as tiles inside a tile do. Merging the pieces of a split
  makes the tile whole again. It works when the tiles lie side by side, with no other tile in between.
* **Double-click** a tile (or select it and press **E** / **Enter ⤵** / **Ctrl+Enter**) to **go inside** it.
  Everything outside is greyed out and the **breadcrumbs** (*Poster › …*) show where you are; you create and split
  tiles there just like on the paper. Double-clicking while you are already typing selects a word instead.
* Inside a tile, **Split ◫ / Split ⊟** (V / H) with nothing selected divide that tile.
* **Esc**, a click outside, or the breadcrumbs take you back out.
* A tile can't be made **smaller than its text** needs: drag further and it stretches like a rubber band, then springs
  back (typing a smaller height is refused too). Making a divided tile smaller first takes the space between its
  tiles, then the room they don't use. Pictures and plots do get smaller with their tile.
* Tiles inside a tile are spaced by a **smaller gap** than the poster's own tiles (both set in Design → Spacing). Each
  divided tile can still get its own **inner margin** and **gutter** in the settings panel; its tiles reflow when it
  is resized.

### Text

* **Click text to start typing** — anywhere, even inside divided tiles. **Esc** stops typing.
* The **formatting toolbar** (second row) works like a word processor:
  * **text style** (Title, Subtitle, Body, Caption, Heading 1–5 and your own), font, size, **B** *I* <u>U</u>, text colour,
  * alignment (left / centre / right / justify), vertical position in the tile, bullet and numbered lists,
  * superscript x² and subscript x₂, line spacing ↕, space after paragraphs ¶, text columns ▥, **Clear** formatting.
  * **Table** (while typing) — insert an empty table, or a copy of a table from the **Data** sidebar; with the caret
    in a cell: add a row above/below or a column, delete a row or column, align a column right (numbers) or left.
    Tables have a bold header row over a heavy rule, light lines between rows and a heavy rule at the end; number
    columns line up their digits. Cells are text, so fonts, colours, bold and superscripts work in them.
* Tile panel → text: **Hyphenate** long words, and with text columns, lists can run **across** (a grid of items,
  row by row) instead of down each column.
* Tile panel → **Background image**: an image from the pool behind a tile's text (cover or fit, with opacity).
* While typing it styles the paragraph or selected text; with tiles selected it styles the whole tiles.

### Colours, borders, headers & footers

* **Fill** (bucket button) and **text colour** offer the design colours, your **recent colours** and a custom picker.
* **Border** — sides, width, colour and rounded corners.
* **Header / Footer** — add or remove a band at the top/bottom of the selected tile (or of the poster).
* **Bleed** — the background runs past the margin to the edge, while the text stays inside the margin.

### Design: the master poster

Click **Design**: the poster is replaced by a **master poster**, a specimen built from your paper and design with one
of every element. It shows your own banner and footer, poster tiles, a tile with a header, tiles inside a tile with a
tile footer, every text style, lists, a table, a figure and the palette. **Click any part** to open its settings in
the panel. Everything that shares that setting is outlined. **Back to the poster** returns to the poster. Changes
apply to the open poster at once.

The settings are grouped like the poster itself:

* **Global** (the poster as a whole)
  * **Paper & spacing:** margins; the gap between the poster's tiles, **across** (↔) and **down** (↕); the space
    around text in tiles; the paper colour.
  * **Watermark:** an image from the pool behind the whole poster, under every tile (a pattern, a seal), with its
    strength and fit. Filled tiles cover it.
  * **Banner & logo:** the banner's colours, border, space around its text, and the **Poster title** and
    **Poster subtitle** styles. Also a **logo** on its left or right side, at a height you choose.
  * **Footer & logos:** colours, border and a **row of logos** (funders, facilities, institutions), spread across or
    aligned left, centre or right.
  * **The poster's tiles:** their fill, border and space around text.
* **Local** (inside tiles)
  * **Tiles inside tiles:** the smaller gaps between them (across and down) and their border. A divided tile can
    still have its own (Tile panel → Inner gutter ↔ / ↕).
  * **Tile headers:** colours, border, the **Tile title** and **Tile subtitle** styles, and whether the subtitle sits
    **below** the title or **beside** it.
  * **Tile footers:** colours and border.
* **Text & colour** (shared by both)
  * **Fonts:** the included fonts, and one font for all text at once.
  * **Palette:** Paul Tol's colour schemes (see below).
  * **Tables:** the heavy rules and the colour of the lines between rows.
  * **Every text style:** font, size, weight, italic, capitals, letter spacing and colour. You can switch it on or
    off, rename it, or add your own with **+ Add text style**.

Watermark and logos belong to the design, so they appear on the poster, the live view and every export.
A tile can still have its **own border** (toolbar → **Border**); *Use the design's border* there switches back.

A new header (poster or tile) starts with a title row and a subtitle row in its kind's styles, and a tile's header is
just tall enough for them. Text never changes size when you resize a tile or header. A header too small for its text
grows to fit it, taking the room from the tiles under it. Dragging a header's bottom edge takes the tiles under it
along. Tiles have **no fill** by default and show the paper. The editor tints unfilled tiles light grey so you can see
where they are; that tint is never printed, exported or shown in the live view or on the master poster.

**Defaults** follow a typical A0 research poster:
* **Text:** TeX Gyre Heros throughout. Poster title 61.5 pt; section headings (Tile title, Heading 1) 37.5 pt; body
  24.75 pt; a grey **Caption** (20.25 pt) for figure captions and notes.
* **Spacing:** 37 mm page margins; 24 mm between columns and 10 mm between rows of tiles; 10.5 mm and 6.5 mm inside
  tiles.
* **Palette:** Paul Tol's Bright.

#### Fonts

Font pickers list three groups:
* **Included: works everywhere.** TeX Gyre Heros (the default, Helvetica-like), TeX Gyre Termes (Times-like),
  Latin Modern Roman and Sans (LaTeX's own) and IBM Plex Mono. They are part of the app: they work offline, look the
  same on every computer, and are embedded in exported PDFs and web pages. Latin Modern Math is included for
  formulas.
* **On this computer.** Every font installed on your computer. It is used where it is, and is not copied into the
  project or embedded in published web pages. On a computer without the font, the poster shows it under
  *Not on this computer* and uses a similar font.
* **Web fonts (older posters).** Fonts from the internet that older posters used; offered only where one is used.

#### Colours: Paul Tol's palettes

The basic palettes are Paul Tol's colour schemes, which stay distinct for colour-blind readers.
* **For groups (qualitative):** Bright (the default), High contrast, Vibrant, Muted, Medium contrast, Light, Pale
  and Dark.
* **For colour scales:** Sunset, Blue–red and Purple–green (diverging); Yellow–orange–brown, Iridescent and Discrete
  rainbow (sequential).

The poster's scheme is offered in every colour menu, and new plots use it. In the plot editor, *Colours & style →
Colour scheme* switches a plot to another scheme.

### Images

Drop or paste an image onto the page or onto a tile, or select an image tile and press **Enter**.

### Projects, posters and saving

* A project is a folder:
  ```
  My project/
    project.json                 name, the poster tree and the image library
    posters/<name>.poster.json   one file per poster (variant)
    assets/images/               images you added (each stored once, named by its content)
    data/                        data files: .csv, .tsv, .json
    export/                      PDFs (suggested location)
  ```
* The **project button** (top left) creates, opens, renames and imports: **Import poster (.json)** adds a saved
  poster file — also one from the browser version. **Show project folder** opens it.
* Everything **saves automatically** a moment after each change, and when the window closes. **Save** (Ctrl+S) saves
  at once.
* **PDF** saves the poster as a PDF at its exact paper size (vector text, backgrounds included).
* **HTML** saves the poster as a web page: one file with its images and fonts, plots stay interactive (hover shows
  their data), it fits any screen, and printing it gives the paper at its true size. Put it on any web server.
* **◧ Live view** shows that web page next to the editor, like the PDF pane of Overleaf: it follows every change as
  you work, and the plots in it are interactive. Drag the divider to resize it.
* Paper size, orientation, margins, gutter and column guides are in the **⚙ Panel**.

### The sidebar: Posters, Images, Data

The strip on the left switches the sidebar between three views; click the open one again to fold it away.

* **Posters** — the project's posters as a tree: **base versions** with the **variants** made from them below.
  Click a poster to edit it. **+** on a poster makes a variant (a copy, placed below it); **+ Base** starts a new
  empty poster. **Drag** a poster onto another to make it a variant of that one, or onto empty space to make it a base
  version. Right-click (or **⋯**) to rename, make a base version, or delete — the variants of a deleted poster move
  up a level.
* **Images** — the project's image pool: images **imported** from outside (also those dropped or pasted onto the
  poster, and files you copy into `assets/images/` yourself), and — in later versions — **drawings** made in the
  drawing mode and **plots**. **Import…** or drop files on the panel to add images. **Double-click** an image to put
  it into the selected tile (or a new tile), or **drag** it onto a tile.
* **Data** — the data workspace, like MATLAB's: every file in `data/` with its **name, size and class**
  (`table`, `double`, `struct`, `char`, `logical`, `cell`). Click one to see its value below. **Import…** (or drop
  files on the panel) copies CSV, TSV or JSON files into the project. **New table** makes a table and saves it as a
  CSV file. **Double-click** a table to edit it in place of the poster: type in cells (Enter moves down), rename
  columns, add rows and columns, delete them with **×**, and **Save** (Ctrl+S) writes the file. Names follow the file
  names, made into valid variable names (`Table 1.csv` → `Table_1`).

### Plots

Quick first, details when you want them.

1. Select a table in the **Data** sidebar and press **Plot** (or **New plot** in the Images sidebar).
2. **Pick a chart** from the gallery — each one is drawn from your table: scatter, line, bars, grouped / stacked bars,
   histogram, area, **dots ± error** (a value ± error per row, coloured by group, like a forest plot) and
   **line ± band**. Columns are chosen for you (numbers, categories, an `err` / `sd` / `se` column, a column to split
   panels by); notes and other free-text columns are shown on hover.
3. Adjust the **basics** if needed — table, X / Y (or value / rows), **Colour by**, **One panel per** — and **Save**.

**Edit right on the plot**: click a title, subtitle, panel title or axis title and type over it (Enter keeps it,
Esc doesn't); **+ Title** adds a title. A clicked text — also axis labels and the legend — is formatted with the
**toolbar**: font, size, bold, italic, colour, and left / centre / right. Styles go with the kind of text (all panel
titles alike, all axis titles alike), so the panels stay consistent.

Everything else is in small categories under the basics, one open at a time (click a part of the preview — an axis,
a title, the legend — to open its category):

* **Titles** — figure, axes, and each panel's title and subtitle (e.g. units).
* **Axes** — linear / log / square-root scale, range, grid, category labels coloured by group, a gap between groups.
* **Colours & style** — group colours, marker size, line width, opacity, white ring, stacking.
* **Error bars** — ± a column, or from one column to another (for *line ± band*: the band).
* **Hover info** — which extra columns (notes, seeds, sources …) show when hovering over a mark.
* **Reference lines & bands** — a line at a value or at the mean of a column (e.g. an experiment), a band over a range
  or over a column's values (e.g. the range of some rows). With one panel per value, each panel uses its own rows.
* **Size & layout** — panel size in mm and text size in pt (true size on the poster), font, panels per row, legend.
* **Advanced** — every panel and layer (a plot is panels of layers drawn on top of each other), row filters, and the
  [Vega-Lite](https://vega.github.io/vega-lite/) spec itself for anything the settings can't do.

**Save** writes `assets/plots/<id>.plot.json` (the plot) and `<id>.svg` (its picture) and adds it to the image pool
under **Plots**. Drag it onto the poster (or **Place on poster** from its menu); double-click it in the pool to edit.
On the poster plots stay **vector** (sharp in the PDF) and **interactive**: hover over a point, bar or line to see its
data. When a table changes, every plot drawn from it is drawn again.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Shift-click | select several tiles |
| Ctrl+Shift (hold) | show split points on tile edges |
| Ctrl+Alt+Shift (hold) | split into equal parts |
| 2 – 9 | number of equal parts |
| T / I | add text / image tile |
| V / H | split selected tile into columns / rows |
| M | merge the selected tiles |
| F | fill free space |
| E, Ctrl+Enter | go inside the selected tile |
| Enter | type in / choose image for the selected tile |
| Esc | stop typing · deselect · go back out |
| Arrows | nudge 1 mm (Shift: 10 mm) · Alt+arrows: grow |
| Delete | delete selected tiles |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+D | duplicate |
| Ctrl+S / Ctrl+O | save now / open project |
| Ctrl+scroll, + / − / 0 | zoom · fit page |

---

## Credits and permissions

Everyone whose work is in Imposters, and what a release needs from them. **Kept up to date with every addition**
(see [SPECIFICATION.md](SPECIFICATION.md) → Credits and permissions). Legend: **Permission** = written permission
needed before a release · **Notice** = no permission needed, but the licence text and credit must ship with the app
· **Credit** = no legal requirement, credited as good practice.

### In the app

| Who | What | Licence | Needs |
|---|---|---|---|
| OpenJS Foundation and Electron contributors | Electron (the desktop shell) | MIT | Notice |
| The Chromium Authors (Google and contributors) | Chromium, inside Electron, with its own third-party parts (FFmpeg, ICU, …) | BSD-3-Clause and others — listed in Electron's `LICENSES.chromium.html` | Notice (ship `LICENSES.chromium.html`) |
| University of Washington Interactive Data Lab (Vega team) | Vega, Vega-Lite (plots) | BSD-3-Clause | Notice |
| Mike Bostock and d3 contributors; Vladimir Agafonkin (delaunator); Jonathan Shewchuk / Vladimir Agafonkin (robust-predicates); others | d3 modules and small libraries bundled with Vega (ISC, MIT, BSD-3, 0BSD, Unlicense) | as listed | Notice (generate the full list at packaging, e.g. `license-checker`) |
| GUST (Polish TeX Users Group); TeX Gyre and Latin Modern authors (B. Jackowski, J. M. Nowacki, P. Strzelczyk; based on URW++ fonts donated under GPL/AFPL) | TeX Gyre Heros, TeX Gyre Termes, Latin Modern Roman/Sans/Math | GUST Font License | Notice; modified versions must be renamed |
| IBM (design: Mike Abbink, Bold Monday) | IBM Plex Mono | SIL Open Font License 1.1 ("Plex" is a Reserved Font Name and an IBM trademark) | Notice; don't use the name for modified versions |
| Fontsource project | the IBM Plex Mono web-font files (packaging) | MIT (packaging) / OFL (fonts) | Notice |
| Paul Tol (SRON Netherlands Institute for Space Research) | the colour schemes (`model/palettes.ts`) | free to use per the author's page | Credit; ask the author to confirm before a commercial release |
| Google Fonts | web fonts loaded only for older posters that use them (Inter, Montserrat, …) | fonts: OFL / Apache 2.0; service: Google Fonts API terms | Notice for any font that gets bundled; none are bundled now |

### Used to build and test (not shipped)

TypeScript (Microsoft, Apache-2.0), Vite and vite-plugin-singlefile (MIT), Vitest (MIT), Puppeteer (Google, Apache-2.0),
fontTools (MIT, used to convert the fonts) — Credit.

### Outside the app

| Who | What | Needs |
|---|---|---|
| The user's TeX distribution (TeX Live, MiKTeX, MacTeX, Tectonic) | run on the user's computer when LaTeX is enabled — not bundled | nothing (planned; keep it unbundled) |
| Fonts installed on the user's computer | used in place, never copied into projects or published pages | nothing (the user's own licences) |

### The example poster (`playground/`, not part of the app)

The reproduction of *Large, Local, and Still Out of Domain* in `playground/example-repro` is for testing only. Before it
(or screenshots of it) appears in the app, its documentation, a website or marketing, **permission is needed** from:

| Who | What |
|---|---|
| The authors: Viktor Svahn, Ioan-Bogdan Magdău, Samuel P. Niblett, Gábor Csányi, Kersti Hermansson, Jolla Kullgren | the poster's text, data and design | 
| American Chemical Society (J. Chem. Theory Comput. 2026, 22, 3660–3671) | the figures adapted from the article are CC BY 4.0: credit is required, permission is not |
| Uppsala University | the university seal and logo (trademarks; their graphic profile rules apply) |
| eSSENCE, NAISS, Swedish Research Council (Vetenskapsrådet), UPPMAX, BIG-MAP, LUMI (EuroHPC JU / CSC) | their logos in the footer (trademarks) |

## Development

```sh
npm run app:dev    # desktop app on the live-reloading dev server
npm run dev        # the editor alone in a browser, at http://localhost:5173
npm run build      # type-check + build dist/index.html
npm run typecheck  # type-check the editor and the Electron main process
npm test           # unit tests (layout rules, document and project model)
npm run test:e2e   # build, then drive the editor in Chrome and the desktop app on a temporary project
```

Chrome is found automatically or set with `CHROME_PATH`. The desktop tests use two environment variables that also
work for scripting: `IMPOSTERS_USER_DATA` (a separate settings folder) and `IMPOSTERS_EXPORT_DIR` (PDF export writes
there without asking).

### Project structure

```
electron/             desktop app: main process (window, project folder access, PDF), preload (window.desktop API)
scripts/app.mjs       starts the desktop app (npm run app / app:dev)
index.html            page skeleton: toolbar, stage, settings panel
src/
  main.ts             entry point: wires the layers together
  commands.ts         named commands for toolbar buttons and shortcuts
  model/              the document: types, tiles, tree helpers, design, styling rules;
                      the project manifest (poster tree, image library), data files (CSV/JSON, size/class),
                      plots (figure → panels → layers, compiled to Vega-Lite)
  layout/             layout rules (pure functions): snapping, free space, cuts, seams,
                      reflow, headers/footers, bleed, containers, paper resize
  editor/             editor state, undo history + autosave, preferences, document commands
  project/            the open project: posters, saving, images, data workspace, plots (desktop folder or browser storage)
  view/               drawing: paper & tiles, overlays, design CSS & fonts, messages, the published page (HTML)
  interaction/        pointer, typing, hover, keyboard, files, zoom
  ui/                 formatting toolbar, menus, main toolbar, settings panel, design tab,
                      project bar, sidebar (posters / images / data), data editor, plot editor, live view
  styles/             CSS by area
tests/unit/           Vitest — model and layout rules
tests/e2e/            node:test + puppeteer-core — the built editor in Chrome and the desktop app
```

Dependencies point one way: `model ← layout ← editor ← view / interaction / project / ui ← main`.
`model/` and `layout/` never touch the DOM, so they can be unit-tested; the editor reaches the outer layers only
through `editor/hooks.ts`.

**Key ideas:** all geometry is in millimetres (the paper renders at true size and is zoomed with a transform);
a tile with `children` is a container laid out inside its inner margin; the editor works on one *level*
(`editor.view.scope`) at a time; colours are `#hex`, `""` or `@role` (linked to the design); text styles are
applied with `data-ts`; every completed change calls `commit()` (undo step + autosave through `hooks.save` into
the project); image sources are project paths (`assets/images/…`, served to the page as `project://local/…`) or,
in the browser, data URLs.

**Adding things:** a toolbar command → `data-act` button + `src/commands.ts`; a formatting control →
`src/ui/formatbar.ts`; a tile property → `model/types.ts`, `makeTile()`, `updateTileEl()`; a layout rule → a pure
function in `layout/` with a unit test.

`window.imposters` exposes the editor state for debugging and the browser tests.
