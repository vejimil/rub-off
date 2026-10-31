// Every number in output text must be one the pipeline computed or a rule constant.
// Text that carries any other number is dropped, so a model can never put a made-up cm on a pattern.

export const roundHalf = (cm: number) => Math.round(cm * 2) / 2;

export const numbersIn = (text: string): number[] => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

export function guardNumbers(text: string, allowed: readonly number[]): boolean {
  return numbersIn(text).every((n) => allowed.some((a) => Math.abs(a - n) < 1e-9));
}
