import { StandardFonts } from '@cantoo/pdf-lib'

export type FontFamily = 'Helvetica' | 'TimesRoman' | 'Courier'

export const FONT_FAMILIES: { key: FontFamily; label: string; cssFamily: string }[] = [
  { key: 'Helvetica', label: 'Helvetica', cssFamily: 'Helvetica, Arial, sans-serif' },
  { key: 'TimesRoman', label: 'Times New Roman', cssFamily: "'Times New Roman', Times, serif" },
  { key: 'Courier', label: 'Courier', cssFamily: "'Courier New', Courier, monospace" },
]

export const DEFAULT_FONT_FAMILY: FontFamily = 'Helvetica'

export function familyOption(key: FontFamily) {
  return FONT_FAMILIES.find((f) => f.key === key) || FONT_FAMILIES[0]
}

/** Resolve a (family, bold, italic) combination to the actual PDF standard
 * font — the 14 built-in PDF fonts only exist as these fixed weight/style
 * combinations, there's no way to synthesize bold/italic from the regular
 * weight the way a browser does. */
export function resolveStandardFont(family: FontFamily, bold: boolean, italic: boolean): StandardFonts {
  const table: Record<FontFamily, Record<'plain' | 'bold' | 'italic' | 'boldItalic', StandardFonts>> = {
    Helvetica: {
      plain: StandardFonts.Helvetica,
      bold: StandardFonts.HelveticaBold,
      italic: StandardFonts.HelveticaOblique,
      boldItalic: StandardFonts.HelveticaBoldOblique,
    },
    TimesRoman: {
      plain: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
      italic: StandardFonts.TimesRomanItalic,
      boldItalic: StandardFonts.TimesRomanBoldItalic,
    },
    Courier: {
      plain: StandardFonts.Courier,
      bold: StandardFonts.CourierBold,
      italic: StandardFonts.CourierOblique,
      boldItalic: StandardFonts.CourierBoldOblique,
    },
  }
  const variant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'plain'
  return table[family][variant]
}

/** Cache key for the font-embed cache in the export builder. */
export function fontCacheKey(family: FontFamily, bold: boolean, italic: boolean) {
  return `${family}:${bold ? 1 : 0}:${italic ? 1 : 0}`
}

/** CSS approximation of a (family, bold, italic) combination, for the
 * live on-screen preview — the actual PDF output always uses the real
 * standard-font glyphs via resolveStandardFont(). */
export function fontOptionCss(family: FontFamily, bold: boolean, italic: boolean) {
  return {
    fontFamily: familyOption(family).cssFamily,
    fontWeight: bold ? ('bold' as const) : ('normal' as const),
    fontStyle: italic ? ('italic' as const) : ('normal' as const),
  }
}


