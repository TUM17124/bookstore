/**
 * Page ordering and numbering invariants for the editor's scene graph.
 *
 * The editor addresses pages two different ways and they MUST agree:
 *  - POSITIONALLY - the canvas renders `doc.pages[n]` as page n+1.
 *  - BY pageNumber - every element call (api.getPageElements, the
 *    apply-elements bake) keys off `page.pageNumber`.
 *
 * A large paste into a blank document broke that agreement: the blank
 * document's original page was still numbered 1 while dozens of pasted pages
 * followed, so two pages claimed to be page 1. That collision pushed text onto
 * the wrong pages, and after a save/reopen the phantom trailing page carried no
 * text at all. Both fixes below are pure so they can be tested without booting
 * React or the parser.
 */

/** Minimal shape needed to order/renumber a page. */
export interface PageLike {
  pageNumber?: number;
}

/**
 * Sort pages ascending by `pageNumber`.
 *
 * The parser is not guaranteed to emit a strictly ascending `pages` array. A
 * page arriving out of order makes the canvas draw page N's elements onto page
 * M - the reported "text lines moved onto other pages" symptom.
 *
 * A page with a missing/invalid pageNumber is real content, so it is kept and
 * moved to the end rather than dropped (losing a page of the user's text is
 * worse than an odd ordering).
 */
export function sortPagesByNumber<T extends PageLike>(pages: T[]): T[] {
  return [...pages].sort((a, b) => {
    const an = Number(a.pageNumber);
    const bn = Number(b.pageNumber);
    const aValid = Number.isFinite(an) && an > 0;
    const bValid = Number.isFinite(bn) && bn > 0;
    if (!aValid && !bValid) return 0;
    // Unnumbered pages sink to the end, preserving their relative order.
    if (!aValid) return 1;
    if (!bValid) return -1;
    return an - bn;
  });
}

/**
 * Stamp positional numbers 1..N onto pages, since position is the truth the
 * canvas renders by and `pageNumber` is what the element APIs address.
 *
 * This is what collapses the duplicate-pageNumber collision introduced by
 * pasting into an existing document, and it keeps a saved/reopened document
 * identical to what was on screen when it was saved.
 */
export function renumberPages<T extends PageLike>(pages: T[]): T[] {
  return pages.map((page, index) => {
    const expected = index + 1;
    return page.pageNumber === expected ? page : { ...page, pageNumber: expected };
  });
}
