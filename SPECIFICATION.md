# Imposters — specification

What Imposters must be and do. The README describes how it works today; this file holds the requirements that
changes must keep.

## Purpose

A local, OS-agnostic desktop app for **research posters** (and later figures): project folders with poster
variants, an image pool, a data workspace, interactive plots from data, optional LaTeX through the user's own TeX
installation, and output as interactive HTML and print PDF. It serves the research community: defaults follow
typical research posters, and everything bundled is free to use and share.

## Fonts

- A basic family ships with the app and works everywhere, offline and embedded in exports: TeX Gyre Heros
  (default) and Termes, Latin Modern Roman, Sans and Math (matching LaTeX), and IBM Plex Mono.
- Only fonts that may be freely redistributed and embedded are bundled (OFL, GUST, Apache 2.0, or similar).
- The fonts installed on the user's computer are offered too. They are used in place: never copied into
  projects or embedded in published pages (the export says which fonts were replaced).

## Colours

- Paul Tol's colour schemes are the basic palettes: qualitative (Bright as the default; also High contrast,
  Vibrant, Muted, Medium contrast, Light, Pale and Dark), and sequential or diverging for colour scales.
- A poster has one scheme. It is offered in every colour menu, and new plots use it.

## Design

- The design is edited on a **master poster**: a specimen poster containing every kind of element (banner,
  footer, poster tiles, tile headers and footers, tiles inside tiles, every text style, lists, tables, figures,
  palette, watermark and logos). Clicking an element opens its settings.
- Settings are divided into **Global** (poster level: paper, margins, gaps between the poster's tiles, banner,
  footer, the poster's tiles, watermark, logos), **Local** (inside tiles: gaps, borders, tile headers and
  footers), and **Text & colour** (fonts, text styles, palette, tables), which both share.
- Watermarks and logos are part of the design: set once, shown on the poster and in all exports.
- Defaults (A0 research poster): 37 mm margins; 24 mm across and 10 mm down between the poster's tiles;
  10.5 mm and 6.5 mm inside tiles; text styles as in the README.

## Credits and permissions

- The README section **Credits and permissions** lists every person and organisation whose work is in the
  app, used to build it, or shown in its examples, and what a release needs from each: written permission, a
  licence notice, or credit.
- **Every change that adds third-party work** (a library, font, palette, icon, image, logo, dataset or example)
  **adds it to that list in the same change.**
- A release ships every required licence notice (including Electron's `LICENSES.chromium.html`) and is not
  made while a "Permission" entry is unresolved.
