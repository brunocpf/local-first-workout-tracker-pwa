/** One area's catalogs. Both locales must define exactly the same keys, or `npm run check` fails. */
export const defineMessages = <const K extends string>(m: { en: Record<K, string>; ptBR: Record<K, string> }) => m;
