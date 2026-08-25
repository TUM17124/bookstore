import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params
  const session = await auth()

  const [agg, mine] = await Promise.all([
    prisma.rating.aggregate({
      where: { bookId },
      _avg: { value: true },
      _count: true,
    }),
    session?.user?.id
      ? prisma.rating.findUnique({
          where: {
            userId_bookId: { userId: session.user.id, bookId },
          },
        })
      : null,
  ])

  return NextResponse.json({
    average: agg._avg.value ?? 0,
    count: agg._count,
    myRating: mine?.value ?? null,
  })
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
  const { value } = await req.json()
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 })
  }

  const row = await prisma.rating.upsert({
    where: {
      userId_bookId: { userId: session.user.id, bookId },
    },
    create: { userId: session.user.id, bookId, value: rating },
    update: { value: rating },
  })

  return NextResponse.json(row)
}