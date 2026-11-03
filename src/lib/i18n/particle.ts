// Korean only: a word with 으로/로, by its last syllable (로 after a vowel or ㄹ).
export function ro(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const final = c >= 0 && c < 11172 ? c % 28 : 0;
  return word + (final === 0 || final === 8 ? "로" : "으로");
}
