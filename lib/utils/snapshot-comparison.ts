/**
 * 스냅샷 간 일간/주간 변동률·변동금액 계산 유틸
 *
 * 설계 원칙:
 * - profitRate 기준: 입출금 노이즈 없는 순수 투자 성과 비교
 * - totalValue 기준: 주식 평가금만 (cashBalance 제외)
 * - 주말/공휴일 처리: 정확히 N일 전 스냅샷이 없으면 최대 allowance일 허용
 */

export interface SnapshotPoint {
  /** ISO 8601 날짜 문자열 또는 Date 객체 */
  date: string | Date
  /** 주식 평가금 (KRW 환산, number로 변환된 값) */
  totalValue: number
  /** 수익률 % */
  profitRate: number
}

export interface ChangeResult {
  /** 수익률 차이 (%p) */
  profitRateDiff: number
  /** 평가금 차이 (원화) */
  totalValueDiff: number
  /** 실제 비교에 사용된 스냅샷의 날짜 */
  referenceDate: Date
  /** 현재 스냅샷과 기준 스냅샷 사이 실제 일 수 */
  daysApart: number
}

/**
 * UTC 기준으로 두 날짜 간의 일 수 차이를 계산한다.
 * 시간 성분을 무시하고 날짜(date) 단위로만 비교한다.
 */
function daysDiff(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const aDay = Math.floor(a.getTime() / msPerDay)
  const bDay = Math.floor(b.getTime() / msPerDay)
  return aDay - bDay
}

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? new Date(d) : d
}

/**
 * snapshots 배열에서 (targetDate - daysAgo)에 가장 가까운 이전 스냅샷을 탐색한다.
 *
 * - 오름차순 정렬(date asc)을 가정
 * - 정확히 daysAgo일 이전이 없으면 ±allowance 범위 내에서 가장 가까운 스냅샷 반환
 * - allowance 범위를 벗어나면 null 반환
 *
 * @param snapshots  날짜 오름차순으로 정렬된 스냅샷 배열
 * @param targetDate 비교 기준이 되는 최신 날짜
 * @param daysAgo    몇 일 전과 비교할지 (1=일간, 7=주간)
 * @param allowance  주말/공휴일 허용 범위 (기본 3일)
 */
export function findPreviousSnapshot(
  snapshots: SnapshotPoint[],
  targetDate: Date,
  daysAgo: number,
  allowance = 3,
): SnapshotPoint | null {
  if (snapshots.length < 2) return null

  const idealDate = new Date(targetDate)
  idealDate.setDate(idealDate.getDate() - daysAgo)

  // targetDate보다 UTC day 기준으로 이전 스냅샷만 후보로.
  // ms 단위 비교(d < targetDate)를 사용하면 오늘 생성된 스냅샷
  // (예: cron이 KST 17:00 실행 → UTC 08:00 저장)도 candidates에
  // 포함되어 "오늘 실시간 vs 오늘 스냅샷" 비교가 발생한다.
  // daysDiff < 0 은 UTC day 기준 strictly before 임을 의미한다.
  const candidates = snapshots.filter((s) => {
    const d = toDate(s.date)
    return daysDiff(d, targetDate) < 0
  })

  if (candidates.length === 0) return null

  // 이상적인 날짜와의 차이가 가장 작은 스냅샷 탐색
  let best: SnapshotPoint | null = null
  let bestDiff = Infinity

  for (const s of candidates) {
    const d = toDate(s.date)
    const diff = Math.abs(daysDiff(d, idealDate))
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }

  // allowance 범위를 초과하면 null
  if (best === null || bestDiff > allowance) return null

  return best
}

/**
 * 두 스냅샷 사이의 변동률·변동금액을 계산한다.
 *
 * @param current  최신 스냅샷
 * @param previous 비교 기준 스냅샷 (null이면 null 반환)
 * @returns ChangeResult 또는 null (이전 스냅샷 없음)
 */
export function calcChange(
  current: SnapshotPoint,
  previous: SnapshotPoint | null,
): ChangeResult | null {
  if (!previous) return null

  const currentDate = toDate(current.date)
  const previousDate = toDate(previous.date)

  return {
    profitRateDiff: current.profitRate - previous.profitRate,
    totalValueDiff: current.totalValue - previous.totalValue,
    referenceDate: previousDate,
    daysApart: daysDiff(currentDate, previousDate),
  }
}
