import { BooksShowcase } from "@/components/ui/books-showcase"
import type { BookCfg } from "@/components/ui/books-showcase"
import { getBooks, asBookList } from "@/lib/api"

type Props = {
  searchParams: Promise<{
    q?: string
    category?: string
    book?: string
  }>
}

function toCfg(
  b: Awaited<ReturnType<typeof asBookList>>[number]
): BookCfg {
  return {
    id: String(b.id),
    title: b.title,
    author: b.author || "Unknown",
    year: b.year || "",
    stars: b.stars ?? 5,
    desc: b.desc || "",
    images: {
      front: b.images?.front || undefined,
      spine: b.images?.spine || undefined,
      back: b.images?.back || undefined,
    },
    edge: b.edge,
    spineBg: b.spineBg,
    spineInk: b.spineInk,
    spineFont: b.spineFont,
    backBg: b.backBg,
    backInk: b.backInk,
    chapters: b.chapters,
  }
}

export default async function Home({
  searchParams,
}: Props) {
  const sp = await searchParams

  const q = sp.q?.trim() || ""
  const category = sp.category?.trim() || ""
  const selectedBookId = sp.book?.trim() || ""

  let books: BookCfg[] = []

  try {
    const data = await getBooks(
      q
        ? { search: q }
        : category
          ? { category }
          : { featured: true }
    )

    const fetchedBooks =
      asBookList(data).map(toCfg)

    /*
     * ======================================================
     * IF A SPECIFIC BOOK WAS SELECTED FROM SEARCH
     * ======================================================
     *
     * Put that exact book FIRST.
     */

    if (selectedBookId) {
  const selectedIndex =
    fetchedBooks.findIndex(
      (book) =>
        String(book.id) === selectedBookId
    )

  if (selectedIndex !== -1) {
    const selectedBook =
      fetchedBooks[selectedIndex]

    const remainingBooks =
      fetchedBooks.filter(
        (_, index) =>
          index !== selectedIndex
      )

    if (remainingBooks.length === 0) {
      books = [selectedBook]
    } else {
      books = [
        remainingBooks[0],
        selectedBook,
        ...remainingBooks.slice(1),
      ]
    }
  } else {
    books = fetchedBooks
  }
} else {
  books = fetchedBooks
}
  } catch (e) {
    console.error(e)
  }

  return (
    <main className="w-full min-h-[calc(100vh-5rem)]">
      <div className="w-full h-[calc(100vh-5rem)] min-h-[560px]">

        {books.length === 0 ? (

          <div
            className="
              flex
              h-full
              flex-col
              items-center
              justify-center
              gap-3
              p-8
              text-center
              text-sm
              text-muted-foreground
            "
          >

            <p>
              {q
                ? `No books found for “${q}”.`
                : "No books yet. Add featured books in Django admin."
              }
            </p>

            {q ? (
              <a
                href="/"
                className="
                  text-foreground
                  underline
                  hover:no-underline
                "
              >
                Clear search
              </a>
            ) : null}

          </div>

        ) : (

          <BooksShowcase
            books={books}
            heroTitle={
              selectedBookId
                ? "Results"
                : q
                  ? "Results"
                  : "Books"
            }
            navTitle={
              selectedBookId
                ? "Results"
                : q
                  ? `Search: ${q}`
                  : "Bestsellers"
            }
            className="h-full w-full"
          />

        )}

      </div>
    </main>
  )
}