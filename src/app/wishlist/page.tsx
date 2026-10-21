import type { Metadata } from "next"
import WishlistPage from "./page-client"
export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: true } }
export default function Page() { return <WishlistPage /> }
