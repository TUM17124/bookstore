"use client"
import Link from 'next/link'
import type { CategoryInfo } from '@/lib/api'
import { categoryHref } from '@/lib/categories'

export function DepartmentMenu({ category, onNavigate, inline = false }: { category: CategoryInfo; onNavigate?: () => void; inline?: boolean }) {
  if(!category.children?.length) return null
  return <details className="relative text-sm"><summary aria-label={`Browse ${category.label} subcategories`} className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 hover:bg-accent">Browse genres &amp; categories</summary><div className={inline ? 'space-y-2 border-l pl-3' : 'absolute left-0 top-full z-[90] max-h-[60dvh] w-64 overflow-auto rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl'}><Branches rows={category.children} onNavigate={onNavigate} /></div></details>
}
function Branches({ rows, onNavigate }: { rows: CategoryInfo[]; onNavigate?: () => void }) {
  return <ul className="space-y-1">{rows.map(row => <li key={row.slug}><Link href={categoryHref(row)} onClick={onNavigate} className="flex min-h-11 items-center rounded-lg px-2 hover:bg-accent">{row.label}</Link>{!!row.children?.length && <details className="ml-2 border-l pl-2"><summary className="cursor-pointer py-2">More in {row.label}</summary><Branches rows={row.children} onNavigate={onNavigate} /></details>}</li>)}</ul>
}
