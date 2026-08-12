/**
 * The label the allocation donut uses for everything it cannot name: slices
 * past the fifth, and holdings the provider has no industry for.
 *
 * A sentinel rather than a word, because the server groups the slices and has
 * no locale to translate the one label it invents. Its own home so that
 * neither side has to import the other's: `src/server/performance.ts` is
 * `server-only`, and the donut is a client component.
 */
export const OTHER_SLICE = '__other__';
