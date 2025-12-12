import { Decimal } from 'decimal.js'

export interface SnapshotResponse {
  id: string
  snapshotDate: Date
  totalValue: Decimal
  totalCost: Decimal
  totalProfit: Decimal
  profitRate: Decimal
  cashBalance: Decimal
  note?: string | null
  holdings: SnapshotHoldingResponse[]
}

export interface SnapshotHoldingResponse {
  id: string
  stockCode: string
  stockName: string
  market: string
  quantity: number
  averagePrice: Decimal
  currentPrice: Decimal
  totalCost: Decimal
  currentValue: Decimal
  profit: Decimal
  profitRate: Decimal
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    cursor?: string
    hasMore: boolean
  }
}

// 스냅샷 생성 요청 타입
export interface CreateSnapshotRequest {
  accountId: string
  cashBalance: number | string
  holdings: CreateHoldingInput[]
  note?: string
}

export interface CreateHoldingInput {
  stockId: string
  quantity: number
  averagePrice: number | string
  currentPrice: number | string
}
