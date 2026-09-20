/**
 * 스냅샷 비교용 상세 타입.
 *
 * `GET /api/snapshots?ids=` 응답 형태다. Prisma Decimal 이 JSON 직렬화되면서
 * 문자열로 오므로 숫자 필드는 `string | number` 로 받고 사용처에서 Number() 한다.
 *
 * ⚠ holdings 의 금액(averagePrice/currentPrice/totalCost/currentValue)은
 * **네이티브 통화**다. 원화가 필요하면 currency==='USD' 인 행에만 환율을 곱하되
 * 매입액은 purchaseRate, 평가액은 스냅샷 exchangeRate 를 쓴다.
 */
export interface SnapshotHoldingDetail {
    stockCode: string
    quantity: number
    averagePrice: string | number
    currentPrice: string | number
    totalCost: string | number
    currentValue: string | number
    currency: string
    purchaseRate: string | number
    stock?: { nameKo?: string; stockCode?: string }
}

export interface SnapshotDetail {
    id: string
    snapshotDate: string
    totalValue: string | number
    totalCost: string | number
    profitRate: string | number
    cashBalance?: string | number
    exchangeRate: string | number
    holdings: SnapshotHoldingDetail[]
}

/** 비교 화면이 "현재 보유"와 대조할 때 쓰는 최소 형태. */
export interface CurrentHoldingSummary {
    id?: string
    stockCode: string
    stockName?: string
    quantity: number
}
