import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/snapshots/[id] - 스냅샷 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const snapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
      include: {
        holdings: {
          include: {
            stock: true,
          },
        },
        account: true,
      },
    })

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: '스냅샷을 찾을 수 없습니다.',
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: snapshot })
  } catch (error) {
    console.error('Snapshot detail fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_FETCH_FAILED',
          message: '스냅샷 조회에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}

// DELETE /api/snapshots/[id] - 스냅샷 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 스냅샷 존재 여부 확인
    const snapshot = await prisma.portfolioSnapshot.findUnique({
      where: { id },
    })

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SNAPSHOT_NOT_FOUND',
            message: '스냅샷을 찾을 수 없습니다.',
          },
        },
        { status: 404 }
      )
    }

    // 스냅샷 삭제 (연관된 holdings도 cascade로 자동 삭제)
    await prisma.portfolioSnapshot.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '스냅샷이 삭제되었습니다.',
    })
  } catch (error) {
    console.error('Snapshot delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SNAPSHOT_DELETE_FAILED',
          message: '스냅샷 삭제에 실패했습니다.',
        },
      },
      { status: 500 }
    )
  }
}
