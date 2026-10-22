import type { Metadata } from "next"
import AdvertisePage from "./page-client"
export const metadata: Metadata = { title: "Advertise a product", robots: { index: false, follow: false } }
export default function Page() { return <AdvertisePage /> }
