import { NextResponse } from 'next/server'
import { auth } from '@/auth' // your auth export
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params

  const [comments, ratings] = await Promise.all([
    prisma.comment.findMany({
      where: { bookId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    prisma.rating.findMany({
      where: { bookId },
      select: { userId: true, value: true },
    }),
  ])

  const ratingByUser = new Map(ratings.map((r) => [r.userId, r.value]))

  const mapped = comments.map((c) => ({
    id: c.id,
    body: c.body,
    bookId: c.bookId,
    parentId: c.parentId,
    createdAt: c.createdAt,
    user: c.user,
    userRating: ratingByUser.get(c.userId) ?? null,
  }))

  return NextResponse.json(mapped)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookId } = await params
  const userId = session.user.id
  const body = await req.json()
  const text = String(body.body || '').trim()
  const parentId = body.parentId ? String(body.parentId) : null

  if (!text || text.length > 2000) {
    return NextResponse.json({ error: 'Invalid comment' }, { status: 400 })
  }

  // Must rate this book before commenting (top-level or reply)
  const rating = await prisma.rating.findUnique({
    where: { userId_bookId: { userId, bookId } },
  })
  if (!rating) {
    return NextResponse.json(
      { error: 'Rate this book before commenting' },
      { status: 403 },
    )
  }

  if (parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentId, bookId },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 })
    }
  }

  const comment = await prisma.comment.create({
    data: { body: text, userId, bookId, parentId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  return NextResponse.json(
    {
      ...comment,
      userRating: rating.value,
    },
    { status: 201 },
  )
}