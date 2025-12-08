import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/stocks - 종목 목록 조회
export async function GET() {
  try {
    const stocks = await prisma.stock.findMany({
      orderBy: { stockName: 'asc' },
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { stockCode, stockName, market, sector } = body

    if (!stockCode || !stockName) {
      return NextResponse.json(
        { success: false, error: 'Stock code and name are required' },
        { status: 400 }
      )
    }

    const stock = await prisma.stock.upsert({
      where: { stockCode },
      update: { stockName, market, sector },
      create: { stockCode, stockName, market, sector },
    })

    return NextResponse.json({ success: true, data: stock })
  } catch (error) {
    console.error('Stock create error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create stock' },
      { status: 500 }
    )
  }
}
