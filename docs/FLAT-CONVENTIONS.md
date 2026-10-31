# Technical flat (도식화) conventions

What the flats in `src/components/*-flat.tsx` follow, and where each rule comes from. Reviewed 2026-10-29. The owner (Clothing & Textiles) has the final say; this is the written trail.

## Rules we apply

| Rule | Where it comes from | In the code |
| --- | --- | --- |
| Three line weights: silhouette heaviest, seams and style lines about half, stitching lightest and dashed. Keep them identical across every flat. | Points of Measure tutorial (outline 2 pt, hems 1 pt, seams 0.75 pt, stitches 0.5 pt dashed 1.5/1.5); LinkedIn Learning *Illustrator for Fashion Design* (outline 2 pt, style lines 1 pt, stitches 0.25 pt); Korean practice calls this 3선 표현 (faddit) | `OUTLINE 0.4`, `SEAM 0.2`, `STITCH 0.12` cm with `STITCH_DASH "0.5 0.35"` in `flat-parts.tsx` (ratio 1 : 0.5 : 0.3) |
| Draw one half and mirror it; curves meet the centre line at 90°. | Points of Measure part 3; Garmentspec guide | Every template is built as the right half and mirrored (`mirror`, `across`) |
| Front and back come from the same outline so widths and lengths match; the back is a separate view with its own details. | Garmentspec guide ("derive the back from the same outline") | `TrouserFlat`/`TopFlat` take `view`; the outline is shared, details switch |
| Close every path. No shading, no movement lines (factories read them as seams). | Garmentspec; Points of Measure part 3; Techpacker (a flat has no shading or movement lines) | Body outlines are closed paths; nothing decorative |
| True proportion, details at real scale: a pocket drawn as a symbol in the wrong place tells the pattern room nothing. | Garmentspec; Szkutnicka draws over a real-proportion template | Everything is in cm; pockets, fly, loops have real sizes; the fitted flat places pockets where SAM found them |
| Callouts: short, numbered, parked outside the silhouette, not crossing each other; meaning must survive grayscale print. | Garmentspec | `Tag` sits in the margin with a leader; added fabric is hatched and removed fabric cross-hatched, so the marks read without colour |
| Points of measure: letters on the flat refer to a measurement chart; flat widths are "on the half". | Tech-pack practice (Onbrand, Techpacker); Flaneurs/Propercloth/Size.ly measuring guides | `Dimension` in `flat-parts.tsx`, `POM_LETTERS` A–D on the fitted flat, letters in the table on `/flat` |
| Trouser measurement points: waist straight across the band; leg opening across the hem; rise from the crotch seam to the band top; inseam crotch to hem; knee about 2 in above the midpoint of crotch–hem. | NIST CS 166-50 (as summarised by Propercloth) | Template `KNEE_Y 62` with crotch 27 and hem 103 (midpoint 65); the outline step measures waist, hem, outseam, rise, inseam |
| Length changes on patterns are marked with a double line ("lengthen or shorten here"); amounts are inserted or folded out between them. | Commercial pattern convention (Univ. of Arkansas apparel production workbook; sewing guides) | Our rise marks show the inserted (hatched) or removed (cross-hatched) strip itself, at the measured amount, with the number beside it |

## Still open

- Korean textbook check: 『패션 디자이너의 도식화』(박주희, 교문사 2012) covers 바지 도식화 with "실루엣 및 필요치수, 순서, 주의사항". Worth comparing our trouser order and required measurements against its 바지 chapter.
- Szkutnicka, *Technical Drawing for Fashion* (2nd ed., Laurence King 2017): the standard English text; we have only its scope, not its exact line-weight numbers.
- Lee & Steen, *Technical Sourcebook for Designers* (Fairchild): has an appendix on seams and stitches and chapters on how to measure; not read at source.

## Sources

- Points of Measure, *Introduction to technical flats*, part 3: https://www.pointsofmeasure.com/tutorials-education/2019/4/3/introduction-to-technical-flats-part-3-of-10
- LinkedIn Learning, *Illustrator for Fashion Design: Advanced Drawing Flats — Style guides for stroke weights*: https://www.linkedin.com/learning/illustrator-for-fashion-design-advanced-drawing-flats/style-guides-for-stroke-weights
- Garmentspec, *How to draw a fashion flat sketch*: https://www.garmentspec.com/blog/technical-flats/
- Techpacker, *The beginner's guide to CAD sketches in fashion*: https://techpacker.com/blog/design/the-beginners-guide-to-cad-sketches-in-fashion/
- faddit, 패션 도식화란: https://faddit.inblog.io/229127
- 박주희, 『패션 디자이너의 도식화』, 교문사 2012: https://m.yes24.com/goods/detail/8456974
- Szkutnicka, *Technical Drawing for Fashion*, 2nd ed.: https://www.hachette.co.uk/titles/basia-szkutnicka/technical-drawing-for-fashion-second-edition/9781780678368/
- Lee & Steen, *Technical Sourcebook for Designers*: https://search.worldcat.org/oclc/847941465
- NIST CS 166-50 (trouser measurement points): https://nvlpubs.nist.gov/nistpubs/Legacy/CS/cs166-50.pdf
- Propercloth, *How to measure pants*: https://propercloth.com/reference/measure-tailored-suit-pants-trousers/
- Univ. of Arkansas, *Introduction to apparel production — pattern symbols*: https://uark.pressbooks.pub/introapparelproductionworkbook/chapter/c-pattern-symbols/
