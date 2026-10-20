// Emit an index.html shell (ssr is off, so it has no content) so the start URL returns 200;
// other paths still fall back to 404.html.
export const prerender = true;
