// Draws the tape-measuring guide for tops (docs/measure-top.png): a T-shirt lying flat, front
// up, with each point of measure numbered as in docs/MEASURING.md. Self-drawn, no photo.
//   node scripts/assets/measure-guide.ts docs/measure-top.png

import sharp from "sharp";

const out = process.argv[2] ?? "docs/measure-top.png";
const S = 10; // px per cm
const O = { x: 420, y: 90 }; // where the centre of the neck (side neck level) sits
const P = (x: number, y: number) => `${O.x + x * S},${O.y + y * S}`;

// The garment, in cm: side neck points (±9, 0), shoulder points (±24, 4), armpits (±28, 24), hem (±27, 70),
// sleeves out to cuffs at (±38, 16)/(±33, 27). Front neck dips 9 cm at the centre.
const outline = [
  [-9, 0], [-24, 4], [-38, 16], [-33, 27], [-28, 24], [-27, 70], [27, 70], [28, 24], [33, 27], [38, 16], [24, 4], [9, 0],
].map(([x, y]) => P(x, y)).join(" L ");
const neck = `M ${P(-9, 0)} Q ${P(-8, 9)} ${P(0, 9)} Q ${P(8, 9)} ${P(9, 0)}`;
const seams = [`M ${P(-24, 4)} L ${P(-28, 24)}`, `M ${P(24, 4)} L ${P(28, 24)}`];

const mark = (n: number, x: number, y: number) =>
  `<circle cx="${O.x + x * S}" cy="${O.y + y * S}" r="15" fill="#d9432a"/><text x="${O.x + x * S}" y="${O.y + y * S + 6}" font-size="18" font-family="Helvetica" font-weight="bold" fill="#fff" text-anchor="middle">${n}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, dash = false) =>
  `<line x1="${O.x + x1 * S}" y1="${O.y + y1 * S}" x2="${O.x + x2 * S}" y2="${O.y + y2 * S}" stroke="#d9432a" stroke-width="3" ${dash ? 'stroke-dasharray="8 6"' : ""} marker-start="url(#a)" marker-end="url(#a)"/>`;
const guide = (y: number) => `<line x1="${O.x - 42 * S}" y1="${O.y + y * S}" x2="${O.x + 42 * S}" y2="${O.y + y * S}" stroke="#2a5bd7" stroke-width="1.5" stroke-dasharray="4 6"/>`;
const dot = (x: number, y: number) => `<circle cx="${O.x + x * S}" cy="${O.y + y * S}" r="5" fill="#1d1d1b"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="860" viewBox="0 0 840 860">
<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="4" fill="#d9432a"/></marker></defs>
<rect width="840" height="860" fill="#f7f5ef"/>
${guide(0)}${guide(24)}${guide(4)}
<path d="M ${outline} Z" fill="#fff" stroke="#1d1d1b" stroke-width="3"/>
<path d="${neck}" fill="none" stroke="#1d1d1b" stroke-width="2.5"/>
${seams.map((d) => `<path d="${d}" fill="none" stroke="#1d1d1b" stroke-width="1.5" stroke-dasharray="6 4"/>`).join("")}
${[[-9, 0], [9, 0], [-24, 4], [24, 4], [-28, 24], [28, 24], [-27, 70], [27, 70], [38, 16], [33, 27]].map(([x, y]) => dot(x, y)).join("")}
${line(9, 0, 9, 70)}${mark(1, 12, 40)}
${line(-28, 24, 28, 24)}${mark(2, -14, 21)}
${line(-24, 4, 24, 4)}${mark(3, -14, 7)}
${line(-27, 70, 27, 70)}${mark(4, -14, 67)}
${line(24, 4, 38, 16)}${mark(5, 33, 7)}
${line(38, 16, 33, 27)}${mark(6, 39.5, 23.5)}
${(() => {
  // Bicep: from the armpit square to the sleeve's top line (24,4)→(38,16).
  const ux = 14 / Math.hypot(14, 12), uy = 12 / Math.hypot(14, 12);
  const t = (28 - 24) * ux + (24 - 4) * uy;
  const fx = 24 + t * ux, fy = 4 + t * uy;
  return line(28, 24, fx, fy, true) + mark(7, 29, 15.5);
})()}
${line(-9, 0, 9, 0)}${mark(8, 0, -2.6)}
${line(-37, 0, -37, 24)}${mark(9, -39.5, 12)}
${line(-15, 0, -15, 4)}${mark(10, -17.5, 2)}
${line(0, 0, 0, 9, true)}${mark(11, 3, 5.5)}
<text x="20" y="840" font-size="14" font-family="Helvetica" fill="#6b6a63">Rub-Off points of measure (front up, flat). Blue dashed: horizontal guides at side-neck, shoulder and armpit level.</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`wrote ${out}`);
