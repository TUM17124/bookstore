"use client"
import { useEffect, useState } from "react"
import { getBook } from "@/lib/api"
import { BooksShowcase, type BookCfg } from "@/components/ui/books-showcase"
import { toCfg } from "@/components/books-department-legacy"
export default function BookViewer({ id }: { id: number }) {
  const [error, setError] = useState(false)
  const [book, setBook] = useState<BookCfg | null>(null)
  useEffect(() => { let active = true; getBook(id).then(b => { if(active && b) setBook(toCfg(b)) }).catch(() => { if(active) setError(true) }); return () => { active = false } }, [id])
  if(error) return <p role="alert">The book viewer could not load. Use the permanent book page or image gallery.</p>
  return book ? <BooksShowcase books={[book]} showNav={false} openBookId={String(id)} /> : <p role="status">Loading book viewer…</p>
}
