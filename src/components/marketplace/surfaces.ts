import type { ListingMedia } from '@/lib/marketplace'
export const SIDES = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const
export function completeSurfaces(media: ListingMedia[]) {
  return SIDES.every(side => media.some(item => (item.surface || item.slot_key) === side && (item.image || item.external_url)))
}
