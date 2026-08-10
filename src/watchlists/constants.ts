/**
 * Name of the auto-maintained watchlist that mirrors the user's open
 * positions. Lives in its own dependency-free module so client components can
 * recognise the list without pulling in the server sync (and the DB with it).
 * Matched by name because there is no "managed" column yet; a user list with
 * this exact name would be taken over.
 */
export const HOLDINGS_LIST = 'Holdings';
