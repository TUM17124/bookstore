"use client"
import Link from 'next/link'
import { useState } from 'react'
import type { CategoryInfo } from '@/lib/api'
import { categoryHref } from '@/lib/categories'

export function DepartmentMenu({ category, onNavigate, inline = false }: { category: CategoryInfo; onNavigate?: () => void; inline?: boolean }) {
  if(!category.children?.length) return null
  return <DepartmentBranchMenu category={category} onNavigate={onNavigate} inline={inline} />
}

function DepartmentBranchMenu({ category, onNavigate, inline }: { category: CategoryInfo; onNavigate?: () => void; inline: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return <details className="relative text-sm" onToggle={(event) => setExpanded(event.currentTarget.open)}><summary aria-label={`Explore ${category.label} subcategories`} className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 hover:bg-accent">Explore {category.label}</summary>{expanded && <div className={inline ? 'space-y-2 border-l pl-3' : 'absolute left-0 top-full z-[90] max-h-[60dvh] w-64 overflow-auto rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl'}><Branches rows={category.children ?? []} onNavigate={onNavigate} /></div>}</details>
}

function Branches({ rows, onNavigate }: { rows: CategoryInfo[]; onNavigate?: () => void }) {
  return <ul className="space-y-1">{rows.map(row => <Branch key={row.slug} row={row} onNavigate={onNavigate} />)}</ul>
}

function Branch({ row, onNavigate }: { row: CategoryInfo; onNavigate?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return <li><Link href={categoryHref(row)} onClick={onNavigate} className="flex min-h-11 items-center rounded-lg px-2 hover:bg-accent">{row.label}</Link>{!!row.children?.length && <details className="ml-2 border-l pl-2" onToggle={(event) => setExpanded(event.currentTarget.open)}><summary className="cursor-pointer py-2">More in {row.label}</summary>{expanded && <Branches rows={row.children} onNavigate={onNavigate} />}</details>}</li>
}
