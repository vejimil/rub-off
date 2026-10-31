# Rub-Off (working title)

Turn a photo of a garment lying flat next to an A4 sheet into things you can act on: a printable sewing pattern (optionally graded to another size), a cutting layout on your own fabric scraps, and a size decision against an online shop's measurement table.

"Rub-off" is the sewing term for copying a finished garment into a pattern. People do it by hand in one to two hours. Online shoppers in Korea compare a shop's measurement table against a garment they own, with a tape measure. Both start from the same thing: a garment you already have.

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Indie Developer track, theme: Build for Your World) by a Clothing & Textiles student who sews.

## How it works

1. **Photograph.** Lay the garment flat on a plain background next to an A4 sheet, all four corners in frame, and shoot from directly above.
2. **Segment.** SAM 3.1 separates the garment, its parts (sleeves, collar, pockets) and the A4 sheet. Muse Spark reads the construction (garment type, set-in or raglan sleeves, knit or woven) from the coloured masks and picks from fixed options only.
3. **Scale and measure.** The A4 sheet gives a centimetre scale with perspective correction. Measurements (length, chest, shoulder, sleeve, hem) come from geometry, each with a ± value. If the sheet is cut off or tilted, the app refuses to measure instead of guessing.
4. **Pattern.** The outline is symmetrised and split into pattern pieces with seam allowance, grainline, notches and fold lines, then tiled onto A4 pages as a 1:1 PDF with a 10 cm test square. A grading table moves it up or down a size.
5. **Size decision.** Muse Spark reads a shop's measurement table from a screenshot into structured data; the app compares it point by point with your garment and recommends a size, showing which measurement is the problem.
6. **Cutting layout.** SAM 3.1 segments your fabric scraps; a nesting step places the pattern pieces on them along the grain and says whether they fit.

No number in the output comes from a language model. Every pattern says "confirm before cutting".

## Built during the hackathon (Oct 26 – Nov 4, 2026)

Everything in this repository was written during the hackathon. The commit history shows when each part was built. Some library code (Meta API client, SAM mask parsing, A4 scale with corner fitting and perspective correction, mask and polygon geometry, number guard) was first written for my other hackathon-period repository, Seated Tailor, between Oct 26 and Oct 31, and ported here on Oct 31.

| Part | Status |
| --- | --- |
| Project setup, Meta Model API client, SAM image calls, Spark structured output (ported) | Done (Oct 31) |
| A4 scale: corner fitting, perspective correction, refusal when the sheet is cut off, covered or not A4 (ported, adapted) | Done (Oct 31) |
| Garment and part segmentation, measurements with ± | Planned |
| Pattern pieces, seam allowance, notches, A4-tiled 1:1 PDF | Planned |
| Size decision against a shop measurement table | Planned |
| Grading table | Planned |
| Cutting layout on fabric scraps | Planned |
| Live deployment with sample mode | Planned |

### Not built by me

- [Next.js](https://nextjs.org) app scaffold (`create-next-app`), React, Tailwind CSS
- [OpenAI Node SDK](https://github.com/openai/openai-node), used as the client for the OpenAI-compatible Meta Model API
- [`@meta-sam/parser`](https://www.npmjs.com/package/@meta-sam/parser), Meta's parser for SAM 3.1 output and masks
- Meta models via [Meta Model API](https://dev.meta.ai): Muse Spark, Muse Image, SAM 3.1

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your MODEL_API_KEY
npm run ping
npm run dev                  # http://localhost:3000
```

## Privacy

Requests use Standard mode, so photos and prompts are not used to train Meta models. Uploads are resized and stripped of metadata before anything is stored, and files sent to the Meta API expire after a day. Sample photos in this repository show my own garments and fabric. The sample measurement table is one I made; no shop's content is included.
