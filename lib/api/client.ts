// API 클라이언트 유틸리티

const BASE_URL = '/api'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  pagination?: {
    cursor?: string
    hasMore: boolean
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  return response.json()
}

// 스냅샷 API
export const snapshotsApi = {
  getList: (cursor?: string) =>
    fetchApi<any[]>(`/snapshots${cursor ? `?cursor=${cursor}` : ''}`),

  getDetail: (id: string) =>
    fetchApi<any>(`/snapshots/${id}`),

  create: (data: {
    snapshotDate?: string
    exchangeRate?: number
    holdings: Array<{
      stockId: string
      quantity: number
      averagePrice: number
      currentPrice: number
    }>
    cashBalance?: number
    note?: string
  }) =>
    fetchApi<any>('/snapshots', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    snapshotDate?: string
    exchangeRate?: number
    holdings?: Array<{
      stockId: string
      quantity: number
      averagePrice: number
      currentPrice: number
      currency?: string
      purchaseRate?: number
    }>
    cashBalance?: number
    note?: string
  }) =>
    fetchApi<any>(`/snapshots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<void>(`/snapshots/${id}`, {
      method: 'DELETE',
    }),
}

// 종목 API
export const stocksApi = {
  getList: () => fetchApi<any[]>('/stocks'),
}

// 잔고 API
export const holdingsApi = {
  getList: () => fetchApi<{ holdings: any[]; summary: any }>('/holdings'),

  create: (data: {
    stockId: string
    quantity: number
    averagePrice: number
    currency?: string
    purchaseRate?: number
    mode?: 'merge' | 'overwrite'
  }) =>
    fetchApi<any>('/holdings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    quantity?: number
    averagePrice?: number
    currency?: string
    purchaseRate?: number
  }) =>
    fetchApi<any>(`/holdings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<void>(`/holdings/${id}`, {
      method: 'DELETE',
    }),
}
