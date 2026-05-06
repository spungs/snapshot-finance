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
      orderBy: { stockName: 'asc' },
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

// POST /api/stocks - 종목 추가
// 인증된 사용자만 새 종목 'create'만 허용. 기존 종목 덮어쓰기는 마스터 데이터를 오염시킬 수 있어
// upsert를 의도적으로 빼고, 이미 존재하는 종목은 그대로 반환한다.
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { stockCode, stockName, engName, market, sector } = body

    if (typeof stockCode !== 'string' || typeof stockName !== 'string' || !stockCode.trim() || !stockName.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'stockCode, stockName이 필요합니다.' } },
        { status: 400 }
      )
    }

    const trimmedCode = stockCode.trim()
    if (trimmedCode.length > 20 || stockName.length > 200) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: '입력값이 너무 깁니다.' } },
        { status: 400 }
      )
    }

    // 이미 존재하는 종목은 덮어쓰지 않고 그대로 반환 — 다른 사용자의 보유 정보 표시가 깨지지 않도록 보호
    const existing = await prisma.stock.findUnique({ where: { stockCode: trimmedCode } })
    if (existing) {
      return NextResponse.json({ success: true, data: existing })
    }

    const stock = await prisma.stock.create({
      data: { stockCode: trimmedCode, stockName, engName, market, sector },
    })

    return NextResponse.json({ success: true, data: stock })
  } catch (error) {
    console.error('Stock create error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'STOCK_CREATE_FAILED', message: 'Failed to create stock' } },
      { status: 500 }
    )
  }
}
