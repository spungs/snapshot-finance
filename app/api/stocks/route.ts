import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/stocks - 종목 목록 조회 (페이지네이션 강제)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 100

    const stocks = await prisma.stock.findMany({
      orderBy: { nameKo: 'asc' },
      take: limit,
    })

    return NextResponse.json({ success: true, data: stocks })
  } catch (error) {
    console.error('Stock fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'STOCK_FETCH_FAILED',
          message: '종목 조회에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}

// POST /api/stocks - stockCode 로 마스터에서 종목 lookup.
// stocks 통합 후 모든 종목은 KIS 마스터에서 사전 주입되므로 'create' 경로는 제거.
// 클라이언트 종목 검색 결과 선택 시, ticker 가 마스터에 있는지 검증하고 그 row 를 그대로 반환한다.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { stockCode } = body

    if (typeof stockCode !== 'string' || !stockCode.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'stockCode가 필요합니다.' } },
        { status: 400 }
      )
    }

    const trimmedCode = stockCode.trim()
    if (trimmedCode.length > 20) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: '입력값이 너무 깁니다.' } },
        { status: 400 }
      )
    }

    const existing = await prisma.stock.findUnique({ where: { stockCode: trimmedCode } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'STOCK_NOT_FOUND', message: '종목 마스터에 없는 ticker 입니다.' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: existing })
  } catch (error) {
    console.error('Stock lookup error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'STOCK_LOOKUP_FAILED', message: 'Failed to look up stock' } },
      { status: 500 }
    )
  }
}
