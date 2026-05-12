// 예수금 계좌 단위 — 사용자가 여러 증권사 예수금을 따로 입력/관리할 수 있게 한다.
// amount 는 정밀도 보존을 위해 string (Decimal as string) 으로 저장.
export interface CashAccount {
    id: string
    label: string
    amount: string
}
