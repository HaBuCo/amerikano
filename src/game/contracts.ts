import { RoundContract } from './types.ts';

export const ROUND_CONTRACTS: RoundContract[] = [
  { title: 'Bir üçlü küt', shortTitle: '3’lü küt', parts: [{ type: 'set', length: 3, count: 1 }] },
  { title: 'Bir üçlü seri', shortTitle: '3’lü seri', parts: [{ type: 'run', length: 3, count: 1 }] },
  { title: 'İki üçlü küt', shortTitle: '2 × 3’lü küt', parts: [{ type: 'set', length: 3, count: 2 }] },
  { title: 'İki üçlü seri', shortTitle: '2 × 3’lü seri', parts: [{ type: 'run', length: 3, count: 2 }] },
  {
    title: 'Bir üçlü küt ve bir üçlü seri',
    shortTitle: '3’lü küt + seri',
    parts: [
      { type: 'set', length: 3, count: 1 },
      { type: 'run', length: 3, count: 1 },
    ],
  },
  { title: 'Bir dörtlü küt', shortTitle: '4’lü küt', parts: [{ type: 'set', length: 4, count: 1 }] },
  { title: 'Bir dörtlü seri', shortTitle: '4’lü seri', parts: [{ type: 'run', length: 4, count: 1 }] },
  { title: 'İki dörtlü küt', shortTitle: '2 × 4’lü küt', parts: [{ type: 'set', length: 4, count: 2 }] },
  { title: 'İki dörtlü seri', shortTitle: '2 × 4’lü seri', parts: [{ type: 'run', length: 4, count: 2 }] },
  {
    title: 'Bir dörtlü küt ve bir dörtlü seri',
    shortTitle: '4’lü küt + seri',
    parts: [
      { type: 'set', length: 4, count: 1 },
      { type: 'run', length: 4, count: 1 },
    ],
  },
  { title: 'Bir beşli seri', shortTitle: '5’li seri', parts: [{ type: 'run', length: 5, count: 1 }] },
  { title: 'Tüm eli tek seferde aç', shortTitle: 'Final', parts: [], final: true },
];

export function contractCardCount(contract: RoundContract) {
  return contract.parts.reduce((total, part) => total + part.length * part.count, 0);
}
