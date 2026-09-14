export type DriverIntent =
  | { type: 'navigate_home' }
  | { type: 'search'; query: string }
  | { type: 'route_option'; option: 'avoid_tolls' | 'allow_tolls' | 'avoid_highways' | 'allow_highways' | 'avoid_ferries' | 'allow_ferries' | 'fastest' | 'shortest' }
  | { type: 'add_stop'; query: string }
  | { type: 'remove_next_stop' }
  | { type: 'cancel_navigation' }
  | { type: 'unknown'; text: string };

const normalized = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase('el-GR')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ');

export function parseDriverIntent(text: string): DriverIntent {
  const value = normalized(text);
  if (!value) return { type: 'unknown', text };

  if (value.includes('πήγαινέ με σπίτι') || value.includes('πήγαινε με σπίτι') || value === 'σπίτι') return { type: 'navigate_home' };
  if (value.includes('απόφυγε διόδια') || value.includes('χωρίς διόδια')) return { type: 'route_option', option: 'avoid_tolls' };
  if (value.includes('βάλε διόδια') || value.includes('με διόδια')) return { type: 'route_option', option: 'allow_tolls' };
  if (value.includes('απόφυγε εθνική') || value.includes('χωρίς αυτοκινητόδρομο')) return { type: 'route_option', option: 'avoid_highways' };
  if (value.includes('μέσω εθνικής') || value.includes('με αυτοκινητόδρομο')) return { type: 'route_option', option: 'allow_highways' };
  if (value.includes('απόφυγε φέρι') || value.includes('χωρίς πλοίο')) return { type: 'route_option', option: 'avoid_ferries' };
  if (value.includes('γρηγορότερη διαδρομή') || value.includes('πιο γρήγορη διαδρομή')) return { type: 'route_option', option: 'fastest' };
  if (value.includes('συντομότερη διαδρομή') || value.includes('πιο μικρή διαδρομή')) return { type: 'route_option', option: 'shortest' };
  if (value.includes('σταμάτα πλοήγηση') || value.includes('ακύρωσε πλοήγηση') || value.includes('τερμάτισε πλοήγηση')) return { type: 'cancel_navigation' };
  if (value.includes('αφαίρεσε επόμενη στάση') || value.includes('βγάλε την επόμενη στάση')) return { type: 'remove_next_stop' };

  const addStop = value.match(/(?:πρόσθεσε στάση|προσθεσε σταση|βάλε στάση|βαλε σταση|πήγαινε πρώτα|πηγαινε πρωτα)\s+(?:στο|στη|σε|τον|την)?\s*(.+)/);
  if (addStop?.[1]) return { type: 'add_stop', query: addStop[1].trim() };

  const categories: Array<[string[], string]> = [
    [['shell'], 'Shell'],
    [['βενζίνη', 'βενζινάδικο', 'βενζιναδικο'], 'gas station'],
    [['parking', 'πάρκινγκ', 'παρκινγκ'], 'parking'],
    [['καφέ', 'καφε', 'coffee'], 'cafe'],
    [['φαρμακείο', 'φαρμακειο'], 'pharmacy'],
    [['νοσοκομείο', 'νοσοκομειο'], 'hospital'],
    [['φαγητό', 'φαγητο', 'εστιατόριο', 'εστιατοριο'], 'restaurant'],
    [['atm'], 'ATM'],
    [['τράπεζα', 'τραπεζα'], 'bank'],
  ];
  for (const [words, query] of categories) if (words.some((word) => value.includes(word))) return { type: 'search', query };

  const find = value.match(/(?:βρες|θέλω|θελω|ψάξε|ψαξε)\s+(.+)/);
  if (find?.[1]) return { type: 'search', query: find[1].trim() };
  return { type: 'unknown', text };
}
