# Project report (LaTeX)

The written report for *Decentralized MRP II with Negotiating Agents*. Edited
locally, compiled locally, and uploaded to Overleaf when you need it there.

## Build

From this folder:

```powershell
.\build.ps1           # compile once
.\build.ps1 -Clean    # delete build artefacts, then compile
.\build.ps1 -Watch    # recompile on every save
```

The PDF is written to `build\main.pdf`. The script also prints how many `\todo`
placeholders are left, so you can see the report filling up.

If you prefer to call LaTeX directly:

```powershell
latexmk -pdf -outdir=build main.tex
```

Requires MiKTeX, which is already installed at
`%LOCALAPPDATA%\Programs\MiKTeX`. The first build may pause while MiKTeX
downloads a missing package; that is normal and happens once.

## Layout

```
report/
  main.tex            master file -- chapter order lives here, and little else
  metadata.tex        name, roll number, guide, college. Edit this first.
  preamble.tex        packages and formatting
  frontmatter/        title page, certificate, declaration, abstract, ...
  sections/           one file per chapter
  figures/            diagrams and screenshots
  references.bib      bibliography
  build/              generated output, git-ignored
```

`main.tex` is deliberately thin. Each chapter is a separate file, so a chapter
can be replaced wholesale without disturbing anything else — which is what
makes merging content from Overleaf straightforward.

## Before you submit

- Fill in every `TODO:` in `metadata.tex`.
- Clear the `\todo{...}` markers. They render in red, so they are hard to miss
  in the PDF, and `.\build.ps1` counts what is left.
- Delete the `\nocite{*}` line in `main.tex`. It lists every bibliography entry
  whether cited or not, which is useful while drafting and wrong in a final
  report.
- Replace the commented-out college logo in `frontmatter/titlepage.tex`.
- Check the whole thing against the department's format sheet. Margins,
  spacing, and the certificate wording are guesses until you have it; they are
  all adjustable from `metadata.tex` and `preamble.tex`.

## Merging content from Overleaf

Nothing here has been reconciled with the existing Overleaf project yet. When
you are ready:

1. In Overleaf: **Menu → Download → Source** to get a zip.
2. Extract it into its own empty folder, *not* into this one — keeping them
   separate means a stray file cannot quietly overwrite work here.
3. Compare chapter by chapter and copy across what you want to keep. Chapter
   files are independent, so this is mostly moving whole files.
4. Commit once per chapter merged, so a bad merge is one `git revert` away.

## Pushing back to Overleaf

Overleaf's Git and Dropbox sync are both premium features, tied to the
*project owner's* subscription. Two notes on that:

- If your college has Overleaf Commons or a group subscription, or the project
  owner is on a paid plan, Git sync works. Get a token from **Account Settings
  → Git integration** (not your account password) and clone the project URL.
- Otherwise: zip this folder and upload it to Overleaf. Overleaf compiles
  `main.tex` with `pdflatex`, and every package used here is standard, so it
  builds there without changes.

Avoid the unofficial cookie-based sync tools unless you have a reason to trust
them; they hold a live session cookie for your Overleaf account.
