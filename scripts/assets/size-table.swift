// Draws the self-made sample size table (public/samples/size-table.png). No shop's content.
//   swift scripts/assets/size-table.swift public/samples/size-table.png
import AppKit
let header = ["사이즈", "총장", "어깨너비", "가슴단면", "소매길이"]
let rows = [["S", "66", "44", "50", "59"], ["M", "68", "46", "53", "60"], ["L", "70", "48", "56", "61"], ["XL", "72", "50", "59", "62"]]
let cellW: CGFloat = 150, cellH: CGFloat = 56, pad: CGFloat = 40
let W = pad * 2 + cellW * CGFloat(header.count), H: CGFloat = pad * 2 + 70 + cellH * CGFloat(rows.count + 1) + 50
let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()
NSColor.white.setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
func draw(_ s: String, _ x: CGFloat, _ yTop: CGFloat, _ w: CGFloat, size: CGFloat, bold: Bool = false, color: NSColor = .black) {
  let p = NSMutableParagraphStyle(); p.alignment = .center
  let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
  let a: [NSAttributedString.Key: Any] = [.font: font, .paragraphStyle: p, .foregroundColor: color]
  (s as NSString).draw(in: NSRect(x: x, y: H - yTop - size * 1.4, width: w, height: size * 1.5), withAttributes: a)
}
draw("상품 실측 사이즈 (단면, cm)", pad, pad, W - 2 * pad, size: 26, bold: true)
let top = pad + 70
for (r, row) in ([header] + rows).enumerated() {
  let y = top + CGFloat(r) * cellH
  if r == 0 { NSColor(white: 0.93, alpha: 1).setFill(); NSRect(x: pad, y: H - y - cellH, width: W - 2 * pad, height: cellH).fill() }
  for (c, cell) in row.enumerated() { draw(cell, pad + CGFloat(c) * cellW, y + 14, cellW, size: 22, bold: r == 0 || c == 0) }
  NSColor(white: 0.75, alpha: 1).setFill(); NSRect(x: pad, y: H - y - cellH, width: W - 2 * pad, height: 1).fill()
}
draw("측정 방법에 따라 1~2cm 오차가 있을 수 있습니다.", pad, top + cellH * CGFloat(rows.count + 1) + 14, W - 2 * pad, size: 16, color: .gray)
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
