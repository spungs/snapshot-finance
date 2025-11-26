import { NextResponse } from 'next/server'
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
