/**
 * 스프레드시트에서 복사한 표(탭 구분)를 헤더 이름으로 매핑해 파싱한다.
 *
 * 구글시트/엑셀에서 헤더행을 포함해 드래그 복사하면 열 순서를 맞출 필요 없이
 * 그대로 붙여넣을 수 있다. 열 순서 고정 형식은 사용자가 시트를 재배치해야 해서
 * "종목을 일일이 옮기는" 부담이 그대로 남는다.
 */

export type PastedRow = {
    /** 종목 해석용 식별자 — 종목코드 우선, 없으면 종목명. */
    identifier: string
    stockName: string
    quantity: number
    averagePrice: number
    /** 시트에 있으면 사용. 없으면 undefined (스냅샷 날짜 기준으로 조회). */
    currentPrice?: number
    /** 매입원금(원화). USD 종목의 매입환율 역산에 쓴다. */
    totalCost?: number
}

export type ParseResult = {
    rows: PastedRow[]
    /** 헤더를 찾지 못했거나 필수 열이 빠졌을 때의 사유. */
    error?: string
    /** 값이 모자라 건너뛴 원본 줄. */
    skipped: string[]
}

type Field = 'code' | 'name' | 'averagePrice' | 'quantity' | 'currentPrice' | 'totalCost'

// 헤더 별칭 — 소문자/공백제거 후 비교
const ALIASES: Record<Field, string[]> = {
    code: ['종목코드', '코드', '티커', 'symbol', 'ticker', 'code'],
    name: ['종목명', '종목', '이름', 'name', 'stock', 'stockname'],
    averagePrice: ['평균매수단가', '평단가', '매수단가', '평균단가', '매입단가', 'avgprice', 'averageprice', 'avg'],
    quantity: ['보유수량', '수량', '주식수', '보유주식수', 'qty', 'quantity', 'shares'],
    currentPrice: ['현재가', '종가', '평가단가', 'price', 'currentprice', 'close'],
    totalCost: ['투자금액', '매입금액', '투자원금', '매입원금', 'cost', 'totalcost', 'investment'],
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[()[\]]/g, '').toLowerCase()

/** "24,000" "₩1,435.5" "$56.74" "-65.00%" → number | null */
export function parseNumber(raw: string | undefined): number | null {
    if (raw == null) return null
    const cleaned = raw.replace(/[,₩$\s%]/g, '').trim()
    if (cleaned === '' || cleaned === '-') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
}

function splitCells(line: string): string[] {
    // 탭이 있으면 탭 기준 (시트 복사본). 없으면 2칸 이상 공백.
    return line.includes('\t') ? line.split('\t') : line.split(/ {2,}/)
}

/** 헤더행을 찾아 열 인덱스를 매핑한다. 못 찾으면 null. */
function findHeader(lines: string[]): { rowIndex: number; map: Partial<Record<Field, number>> } | null {
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const cells = splitCells(lines[i]).map(norm)
        const map: Partial<Record<Field, number>> = {}

        for (const field of Object.keys(ALIASES) as Field[]) {
            const idx = cells.findIndex((c) => c !== '' && ALIASES[field].includes(c))
            if (idx >= 0) map[field] = idx
        }

        // 수량 + 평단가는 반드시 있어야 의미 있는 행을 만들 수 있다.
        if (map.quantity !== undefined && map.averagePrice !== undefined && (map.code !== undefined || map.name !== undefined)) {
            return { rowIndex: i, map }
        }
    }
    return null
}

export function parsePastedTable(text: string): ParseResult {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
    if (lines.length === 0) return { rows: [], skipped: [], error: 'EMPTY' }

    const header = findHeader(lines)
    if (!header) return { rows: [], skipped: [], error: 'NO_HEADER' }

    const { rowIndex, map } = header
    const rows: PastedRow[] = []
    const skipped: string[] = []

    for (let i = rowIndex + 1; i < lines.length; i++) {
        const line = lines[i]
        const cells = splitCells(line)
        const at = (f: Field | undefined) => (f !== undefined && map[f] !== undefined ? cells[map[f]!]?.trim() : undefined)

        const code = at('code')
        const name = at('name')
        const identifier = (code && code !== '' ? code : name) ?? ''
        const quantity = parseNumber(at('quantity'))
        const averagePrice = parseNumber(at('averagePrice'))

        // 종목/수량/평단가가 없으면 합계행·현금행·빈줄 — 조용히 건너뛰되 목록에 남긴다.
        if (!identifier || quantity === null || quantity <= 0 || averagePrice === null || averagePrice <= 0) {
            if (line.trim()) skipped.push(line.trim())
            continue
        }

        const currentPrice = parseNumber(at('currentPrice'))
        const totalCost = parseNumber(at('totalCost'))

        rows.push({
            identifier,
            stockName: (name && name !== '' ? name : identifier),
            quantity: Math.trunc(quantity),
            averagePrice,
            ...(currentPrice !== null && currentPrice > 0 ? { currentPrice } : {}),
            ...(totalCost !== null && totalCost > 0 ? { totalCost } : {}),
        })
    }

    return { rows, skipped }
}

/**
 * USD 종목의 매입환율을 투자금액에서 역산한다.
 *   매입환율 = 투자금액(원화) / (평단가(USD) × 수량)
 *
 * 시트에는 보통 종목별 매입환율 열이 없고 원화 투자금액만 있는데, 종목마다 매입 시점이
 * 달라 환율도 제각각이다(같은 시트에서 1117 ~ 1461). 역산하면 원래 수익률이 보존된다.
 * 결과가 상식 범위를 벗어나면 신뢰할 수 없으므로 null.
 */
export function derivePurchaseRate(row: PastedRow): number | null {
    if (!row.totalCost) return null
    const denom = row.averagePrice * row.quantity
    if (denom <= 0) return null
    const rate = row.totalCost / denom
    if (!Number.isFinite(rate) || rate < 500 || rate > 3000) return null
    return Math.round(rate * 100) / 100
}
