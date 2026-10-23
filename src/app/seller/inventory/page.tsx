import type { Metadata } from "next"
import InventoryClient from "./page-client"

export const metadata: Metadata = { title: "Inventory | PlugYard", robots: { index: false, follow: false } }

export default function InventoryPage() { return <InventoryClient /> }
