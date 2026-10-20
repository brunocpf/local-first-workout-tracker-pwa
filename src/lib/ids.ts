/** Random UUID v4. Needs a secure context in browsers (HTTPS/localhost); available in Node and jsdom tests. */
export const newId = (): string => crypto.randomUUID();
