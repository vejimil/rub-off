# Rub-Off (working title)

Turn a photo of a garment lying flat next to an A4 sheet into things you can act on: a printable sewing pattern (optionally graded to another size), a cutting layout on your own fabric scraps, a size decision against an online shop's measurement table, and an alteration order for a tailor written from your own complaint.

Live: https://rub-off.vercel.app/en (upload a photo, or open the sample runs). Demo video: https://youtu.be/S322D-vkXv4

"Rub-off" is the sewing term for copying a finished garment into a pattern. People do it by hand in one to two hours. Online shoppers in Korea compare a shop's measurement table against a garment they own, with a tape measure. Both start from the same thing: a garment you already have.

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Indie Developer track, theme: Build for Your World) by a Clothing & Textiles student who sews.

## For judges (two minutes)

| | |
|---|---|
| **What is new** | Everything in this repository, written Oct 26 to Nov 4 by one person (library code ported on Oct 31 from my other hackathon-period repo, Seated Tailor; see the table below). |
| **Meta models (3)** | SAM 3.1 cuts out the garment, its sleeves, hood, pockets, the A4 sheet and fabric scraps, one noun per call. Muse Spark says, from fixed options, what the item is and which way it lies, which noun to hand SAM, which sleeves lie flat, what each pocket is; it also copies a shop's size chart from a screenshot and sorts a wearer's complaint into known fit problems. Muse Image draws the garment in another fabric, kept to SAM's mask. |
| **What code decides, not the model** | Every centimetre: the sheet's corners map the photo onto the floor plane, points of measure come from the outline with a ± each, pieces are drafted by rule tables, pattern pieces are nested along the grain, sizes are compared point by point. No number in any output comes from a language model; a value outside what a garment can measure is refused. |
| **Measured** | One T-shirt against a tape: all ten values inside the stated ±, chest and hem within 2%, length 2.7 cm long (4%). Size chart read 16 of 16 cells. Denim hoodie lying on its side: read as trousers 5 of 7 times, as a hoodie 3 of 3 once the app turned it neck-up. The pattern was printed, its 10 cm square checked with a ruler, and laid on the shirt (in the video). |
| **Cost** | About $0.02 to $0.06 per photo (SAM $2.50 per thousand images plus a few Spark calls), cached by the photo's hash. Live runs capped per visitor and per day. |
| **Try it** | Live: https://rub-off.vercel.app/en (upload a photo, or open the sample runs, which need no API call) · Video (2:51): https://youtu.be/S322D-vkXv4 · Locally: `npm install && cp .env.example .env.local && npm run dev`, then `/en/sample` needs no key. |
| **Where to look** | `src/lib/photo/run.ts` (photo to measurements), `src/lib/measure/` (points of measure), `src/lib/pattern/` (drafting, seam allowance, PDF), `src/lib/size/decide.ts` (size decision), `src/lib/nest/` (cutting layout), `src/lib/fit/` (alterations), `src/lib/meta/` (SAM and Spark calls), `src/lib/rules/numbers.ts` (number guard). Tests: `npm test` (78). |

## How it works

1. Photograph. Lay the garment flat on a plain background next to an A4 sheet, all four corners in frame, and shoot from directly above.
2. Identify. Muse Spark looks at the photo first and says, from fixed options, which of the thirteen kinds the item is (or, when you chose the kind, only that), which edge of the photo its top points to, whether the cloth is knit or woven, and which single noun to hand SAM for it. The photo is stood upright before SAM sees it. The kind is then checked by SAM and the geometry: if that garment's own points aren't in the photo (no neckline for a top, no crotch for trousers), Spark looks again at the photo turned the other way up, and that answer is measured once; if it fails too, the app says what it took the item for and asks you to choose.
3. Segment. SAM 3.1 separates the garment, its parts (sleeves, hood, pockets, bag handles) and the A4 sheet, one short noun per request. Muse Spark then sees the sleeve masks coloured and numbered and says, from fixed options, which sleeves are spread flat, folded or hidden, and how wrinkled the garment is; only sleeves the geometry and Spark both call spread are measured.
4. Scale and measure. The A4 sheet's corners map the photo onto the floor plane in centimetres (perspective included). The points of measure (armpits, shoulder points, hem corners, crotch, cuffs) come from the outline's geometry, each value with a ±. If the sheet is cut off, covered or not A4, or a value falls outside what a garment can measure, the app refuses and asks you to measure instead of guessing. No number in the output comes from a language model.
5. Pockets. On a top, Muse Spark sees each SAM pocket mask coloured and numbered and says what it is: a patch pocket (square or rounded), a kangaroo pocket, one half of a kangaroo split by a zip, a pocket set into a seam (left off the pattern), or no pocket at all, and whether it is partly covered. The pocket's size and place come from its mask on the floor plane, each with a ± that counts the centre line (twice, for a kangaroo's width) and the two neck points, and it goes onto the drafted front where it was on the garment; if it has to be moved up or made smaller to fit the drafted panel, or can't fit at all, the pattern says so.
6. Pattern. The measurements draft the garment's pieces (front, back, sleeve with its cap solved to the armhole, collar, cuffs, legs, panels, bag body and handles) with per-edge seam allowance, grainline, notches and fold lines, tiled onto A4 pages as a 1:1 PDF with a 10 cm test square. Grading moves the measurements by a size step and drafts again. Every pattern says "confirm before cutting".
7. Size decision. Muse Spark reads a shop's measurement table from a screenshot into structured data; the app compares it point by point with your garment and recommends a size, showing which measurement is the problem. A length no size comes near (a long-sleeved table against a short-sleeved T-shirt) is another style, not another size: it is left out of the comparison and the app says so.
8. Cutting layout and fabric preview. SAM 3.1 segments your fabric scraps (or you type their sizes); a nesting step places the pattern pieces on them along the grain and says whether they fit, and by how much they don't. Muse Image then draws the garment photo with the fabric photo as its second input, and only the pixels inside SAM's garment mask are kept, so the outline and everything around it stay your photo.
9. Fit and alterations. Type your body measurements (taken with a tape) and pick or write what bothers you when you wear the garment ("in my wheelchair the back of my trousers drops"). Body sizes plus the ease for the fit you want become target garment sizes; Muse Spark sorts your words into a fixed list of known fit problems, copying only lengths you wrote. Alteration rules (including seated-fit rules from research) turn both into a work order for a tailor, with a technical flat (front and back) drawn from the garment's own measurements and every change marked on it at its real size, numbered to match the order.

What failed, and what fixed it. On my denim hoodie lying on its side, SAM found neither `hoodie` nor `hood`, and found both once the photo was turned neck-up; the same photo was read as trousers by Spark in 5 of 7 tries, and as a hoodie in 3 of 3 once upright. That is why the photo is stood upright first and the kind is checked against the geometry. The noun matters too: `shirt` found nothing on my T-shirt where `t-shirt` found it at 0.99, so Spark names the noun.

## Built during the hackathon (Oct 26 – Nov 4, 2026)

Everything in this repository was written during the hackathon. The commit history shows when each part was built; the repository starts on Oct 31, when the ported code and that day's work were committed together. Some library code (Meta API client, SAM mask parsing, A4 scale with corner fitting and perspective correction, mask and polygon geometry, number guard) was first written for my other hackathon-period repository, Seated Tailor, between Oct 26 and Oct 31, and ported here on Oct 31. The seated-fit alteration rules (Nov 2) follow the research I wrote for Seated Tailor in the same period.

| Part | Status |
| --- | --- |
| Project setup, Meta Model API client, SAM image calls, Spark structured output (ported) | Done (Oct 31) |
| A4 scale: corner fitting, perspective correction, refusal when the sheet is cut off, covered or not A4 (ported, adapted) | Done (Oct 31) |
| Measurements from a flat-lay photo for tops, pants, skirts and bags: outline on the floor plane, points of measure, ± per value, refusal outside physical ranges (pants outline ported from Seated Tailor, the rest new) | Done (Oct 31); checked against a tape on Nov 1, see below |
| Pattern drafting from flat measurements for five garments, per-edge seam allowance, grainline, notches, fold, sleeve cap solved to the armhole | Done (Oct 31) |
| Thirteen garments and items on the same piece model: long-sleeve T-shirt, sweatshirt (neck, hem and cuff ribs), T-shirt dress, A-line skirt (waistband, side zip), bib apron, envelope cushion cover and zip pouch added; their photo measurement reuses the top, skirt and rectangle measures | Done (Nov 2), not yet tried on real photos |
| A4-tiled 1:1 PDF with a 10 cm test square, page map, overlaps and alignment lines | Done (Oct 31); printed, the 10 cm square checked with a ruler, taped and laid on the T-shirt for the demo video (Nov 4) |
| Grading by size steps (re-drafts from graded measurements) | Done (Oct 31), increments to be confirmed |
| Size decision: Muse Spark copies a size table, code compares it with your garment | Done (Oct 31) |
| Cutting layout on your own fabric (raster bottom-left fill along the grain) | Done (Oct 31) |
| Web app with sample mode (no API calls) and live-run limits. Samples: my T-shirt and shorts from real photos, and an alteration order from a written example; any garment can be drafted without a photo from typical measurements on the pattern screen | Done (Oct 31; samples Nov 2), live on Vercel since Nov 4 |
| Real-photo robustness: Muse Spark layout check (folded or hidden sleeves, wrinkles, hem), sleeves folded over the body left out and the other side mirrored, hood removed from the outline, photos turned 90°, garments cut off by the frame refused | Done (Oct 31), on the owner's T-shirt and hoodie |
| Zip hoodie (two-piece hood, rib bands); front and back photos combined | Done (Oct 31) |
| Checked against the owner's tape measurements of one T-shirt (all ten values inside the stated ±; chest and hem within 2%, length within 4%); shoulder point from the fitted armhole seam, or tapped on the photo (sleeve length −1%) | Done (Nov 1) |
| Pattern dimensions: every seam line's length on the piece, seams sewn together compared (sleeve cap ease, front/back side seams), the flat measurements a pattern was drafted from on its cover | Done (Nov 2) |
| Fit and alterations: body measurements to target garment sizes with ease per fit [to confirm], wearer's complaints picked or written (Muse Spark sorts the words), alteration rules into a work order, marked on a technical flat drawn from the pattern's measurements (added fabric hatched, removed fabric cross-hatched, openings and new lines in red, numbered tags). Seated-fit rules and the flat drawing conventions carried over from Seated Tailor | Done (Nov 2), one Spark run on an example text |
| Alteration screen of its own (`/alter`): photo, then the wearer's words first, the work order printable on its own; everyday complaints added (sleeves or length too short, body too big, shoulders too wide, legs too wide, waist too tight) | Done (Nov 2), rules only, no new Spark run |
| Patch pockets dragged onto the pattern's panels (square, rounded, kangaroo on a front cut on the fold): each becomes a piece with its opening allowance, its outline is dotted on the panel in the preview and the PDF, and it follows the panel when graded | Done (Nov 2), not yet printed |
| Size decision: a length no size comes near (another style, e.g. long sleeves against short) left out and said; the sample table is now a short-sleeved T-shirt's, read again by Muse Spark (16 of 16 cells) | Done (Nov 3) |
| Muse Spark tells the item's kind, knit or woven, the SAM word and which way the item lies ("Auto"); the photo is stood upright before SAM; a kind whose points the geometry can't find gets a second look with the photo turned the other way up; if Spark's SAM word finds nothing, the app's own word and then "clothing" are tried once each (on my denim hoodie lying on its side, SAM found the garment only as "clothing" or "denim") | Done (Nov 3). Right on four photos lying neck-up (two T-shirts, my white zip hoodie, shorts). My denim hoodie lying on its side: read as trousers in 5 of 7 tries; the second look turned it neck-up and measured it as a hoodie |
| Pockets from the photo: SAM `pocket`, Muse Spark says which kind and whether it is covered, size and place from the mask, put on the pattern; a kangaroo pocket on a zip front is cut as two halves | Done (Nov 3), on my white zip hoodie (33.6 × 22.0 cm, 51.5 cm below the shoulder) and my denim zip hoodie (41.6 × 24.9 cm), neither yet against a tape |
| Muse Image fabric preview: garment photo + fabric photo, kept to SAM's garment mask | Done (Nov 3), with a drawn gingham swatch and my own green fabric on my denim hoodie; Muse Image drew the sleeves a little thinner, so a faint line of floor shows at the cuffs |

### Not built by me

The code was written with Claude Code as the pair programmer (every commit says so). The photos, the tape measurements, the printed pattern and the checks against them are mine; rule tables it drafted are marked [A] in the code and "to confirm" in the table above until I have checked them.

- [Next.js](https://nextjs.org) app scaffold (`create-next-app`), React, Tailwind CSS
- [OpenAI Node SDK](https://github.com/openai/openai-node), used as the client for the OpenAI-compatible Meta Model API
- [`@meta-sam/parser`](https://www.npmjs.com/package/@meta-sam/parser), Meta's parser for SAM 3.1 output and masks
- [pdf-lib](https://pdf-lib.js.org) for writing the PDF, [clipper-lib](https://www.npmjs.com/package/clipper-lib) for polygon union in the seam allowance, [sharp](https://sharp.pixelplumbing.com) for preparing photos
- [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) to embed a font in the PDF, and [Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR) (SIL Open Font License 1.1, licence in `public/fonts/`) for Korean patterns, cut down to the 2,350 KS X 1001 Hangul syllables plus Latin
- Meta models via [Meta Model API](https://dev.meta.ai): Muse Spark, Muse Image, SAM 3.1

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your MODEL_API_KEY
npm run ping
npm run dev                  # http://localhost:3000, /sample needs no key
```

Command-line tools (no API call unless `--yes`):

```bash
npm run pattern                                   # example PDFs for every garment in .cache/patterns/
npm run photo -- shirt.jpg --garment=shirt        # measurements, overlay and pattern from a photo
npm run size -- table.png --mine=chest:52.5,length:71   # read a size table and decide
npm run alter -- "앉으면 바지 뒤가 내려가요" --garment=pants   # sort a wearer's words, print the alterations
npm run photo -- shirt.jpg --garment=auto         # Muse Spark tells the kind and the SAM word first
npm run preview -- shirt.jpg fabric.jpg --word=t-shirt   # the measured garment in another fabric (Muse Image)
```

## Privacy

Requests use Standard mode, so photos and prompts are not used to train Meta models. Uploads are resized and stripped of metadata before anything is stored, photos go inline with each request rather than through file storage, and Spark requests are sent with store: false. Sample photos in this repository show my own garments and fabric; the T-shirt photo is cut out to the garment and the A4 sheet (`npm run photo -- --json --cutout`). The sample measurement table is one I made; no shop's content is included.

## License

MIT. See `LICENSE`. The Noto Sans KR font in `public/fonts/` keeps its own SIL Open Font License.
