export type DriverIntent =
  | { type: 'navigate_home' }
  | { type: 'search'; query: string }
  | { type: 'route_option'; option: 'avoid_tolls' | 'fastest' }
  | { type: 'cancel_navigation' }
  | { type: 'unknown'; text: string };

const normalized = (text: string) => text.trim().toLocaleLowerCase('el-GR').replace(/[.,!?]/g, '');

export function parseDriverIntent(text: string): DriverIntent {
  const value = normalized(text);
  if (!value) return { type: 'unknown', text };
  if (value.includes('πήγαινέ με σπίτι') || value.includes('πήγαινε με σπίτι') || value === 'σπίτι') return { type: 'navigate_home' };
  if (value.includes('απόφυγε διόδια') || value.includes('χωρίς διόδια')) return { type: 'route_option', option: 'avoid_tolls' };
  if (value.includes('γρηγορότερη διαδρομή') || value.includes('πιο γρήγορη διαδρομή')) return { type: 'route_option', option: 'fastest' };
  if (value.includes('σταμάτα πλοήγηση') || value.includes('ακύρωσε πλοήγηση')) return { type: 'cancel_navigation' };

  const categories: Array<[string[], string]> = [
    [['shell', 'βενζίνη', 'βενζινάδικο'], 'gas station'],
    [['parking', 'πάρκινγκ'], 'parking'],
    [['καφέ', 'καφε'], 'cafe'],
    [['φαρμακείο', 'φαρμακειο'], 'pharmacy'],
    [['νοσοκομείο', 'νοσοκομειο'], 'hospital'],
    [['φαγητό', 'φαγητο', 'εστιατόριο', 'εστιατοριο'], 'restaurant'],
  ];
  for (const [words, query] of categories) if (words.some((word) => value.includes(word))) return { type: 'search', query };

  const find = value.match(/(?:βρες|θέλω|θελω)\s+(.+)/);
  if (find?.[1]) return { type: 'search', query: find[1].trim() };
  return { type: 'unknown', text };
}
