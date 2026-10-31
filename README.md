# Rub-Off (working title)

Turn a photo of a garment lying flat next to an A4 sheet into things you can act on: a printable sewing pattern (optionally graded to another size), a cutting layout on your own fabric scraps, and a size decision against an online shop's measurement table.

"Rub-off" is the sewing term for copying a finished garment into a pattern. People do it by hand in one to two hours. Online shoppers in Korea compare a shop's measurement table against a garment they own, with a tape measure. Both start from the same thing: a garment you already have.

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Indie Developer track, theme: Build for Your World) by a Clothing & Textiles student who sews.

## How it works

1. **Photograph.** Lay the garment flat on a plain background next to an A4 sheet, all four corners in frame, and shoot from directly above.
2. **Segment and check.** SAM 3.1 separates the garment, its parts (sleeves, hood, bag handles) and the A4 sheet, one short noun per request. Muse Spark then sees the sleeve masks coloured and numbered and says, from fixed options, which sleeves are spread flat, folded or hidden, and how wrinkled the garment is; only sleeves the geometry and Spark both call spread are measured.
3. **Scale and measure.** The A4 sheet's corners map the photo onto the floor plane in centimetres (perspective included). The points of measure (armpits, shoulder points, hem corners, crotch, cuffs) come from the outline's geometry, each value with a ±. If the sheet is cut off, covered or not A4, or a value falls outside what a garment can measure, the app refuses and asks you to measure instead of guessing.
4. **Pattern.** The measurements draft the garment's pieces (front, back, sleeve with its cap solved to the armhole, collar, cuffs, legs, panels, bag body and handles) with per-edge seam allowance, grainline, notches and fold lines, tiled onto A4 pages as a 1:1 PDF with a 10 cm test square. Grading moves the measurements by a size step and drafts again.
5. **Size decision.** Muse Spark reads a shop's measurement table from a screenshot into structured data; the app compares it point by point with your garment and recommends a size, showing which measurement is the problem.
6. **Cutting layout.** SAM 3.1 segments your fabric scraps (or you type their sizes); a nesting step places the pattern pieces on them along the grain and says whether they fit, and by how much they don't.

No number in the output comes from a language model. Every pattern says "confirm before cutting".

## Built during the hackathon (Oct 26 – Nov 4, 2026)

Everything in this repository was written during the hackathon. The commit history shows when each part was built. Some library code (Meta API client, SAM mask parsing, A4 scale with corner fitting and perspective correction, mask and polygon geometry, number guard) was first written for my other hackathon-period repository, Seated Tailor, between Oct 26 and Oct 31, and ported here on Oct 31.

| Part | Status |
| --- | --- |
| Project setup, Meta Model API client, SAM image calls, Spark structured output (ported) | Done (Oct 31) |
| A4 scale: corner fitting, perspective correction, refusal when the sheet is cut off, covered or not A4 (ported, adapted) | Done (Oct 31) |
| Measurements from a flat-lay photo for tops, pants, skirts and bags: outline on the floor plane, points of measure, ± per value, refusal outside physical ranges (pants outline ported from Seated Tailor, the rest new) | Done (Oct 31), not yet checked against a tape measure |
| Pattern drafting from flat measurements for five garments, per-edge seam allowance, grainline, notches, fold, sleeve cap solved to the armhole | Done (Oct 31) |
| A4-tiled 1:1 PDF with a 10 cm test square, page map, overlaps and alignment lines | Done (Oct 31), not yet printed |
| Grading by size steps (re-drafts from graded measurements) | Done (Oct 31), increments to be confirmed |
| Size decision: Muse Spark copies a size table, code compares it with your garment | Done (Oct 31) |
| Cutting layout on your own fabric (raster bottom-left fill along the grain) | Done (Oct 31) |
| Web app with sample mode (no API calls) and live-run limits | Done (Oct 31), not deployed |
| Real-photo robustness: Muse Spark layout check (folded or hidden sleeves, wrinkles, hem), sleeves folded over the body left out and the other side mirrored, hood removed from the outline, photos turned 90°, garments cut off by the frame refused | Done (Oct 31), on the owner's T-shirt and hoodie |
| Zip hoodie (two-piece hood, rib bands); front and back photos combined | Done (Oct 31) |
| Muse Image fabric preview | Planned |

### Not built by me

- [Next.js](https://nextjs.org) app scaffold (`create-next-app`), React, Tailwind CSS
- [OpenAI Node SDK](https://github.com/openai/openai-node), used as the client for the OpenAI-compatible Meta Model API
- [`@meta-sam/parser`](https://www.npmjs.com/package/@meta-sam/parser), Meta's parser for SAM 3.1 output and masks
- [pdf-lib](https://pdf-lib.js.org) for writing the PDF, [clipper-lib](https://www.npmjs.com/package/clipper-lib) for polygon union in the seam allowance, [sharp](https://sharp.pixelplumbing.com) for preparing photos
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
```

## Privacy

Requests use Standard mode, so photos and prompts are not used to train Meta models. Uploads are resized and stripped of metadata before anything is stored, and files sent to the Meta API expire after a day. Sample photos in this repository show my own garments and fabric. The sample measurement table is one I made; no shop's content is included.
