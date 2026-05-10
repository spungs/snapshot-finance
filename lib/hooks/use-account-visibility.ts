'use client'

/**
 * 계좌 1개일 때는 셀렉터/보기 토글을 숨기기 위한 helper.
 * 다른 에이전트(보유 종목 화면 등) 가 활용.
 *
 * 단일 hook 보다 단순 함수가 의도를 더 잘 표현해서 함수로 제공.
 */
export interface AccountVisibilityInput {
    /** 사용자가 보유한 BrokerageAccount 개수 */
    accountCount: number
}

export interface AccountVisibilityResult {
    /** 계좌가 1개면 false — 셀렉터 / 보기 토글을 숨겨야 함 */
    showAccountSelector: boolean
    /** 계좌가 0개면 빈 상태 화면을 띄우는 데 사용 */
    isEmpty: boolean
    /** 다중 계좌(2개 이상) 인지 */
    isMulti: boolean
}

export function getAccountVisibility(input: AccountVisibilityInput): AccountVisibilityResult {
    const { accountCount } = input
    return {
        showAccountSelector: accountCount > 1,
        isEmpty: accountCount === 0,
        isMulti: accountCount > 1,
    }
}

/**
 * React hook 형태가 필요한 경우의 wrapper.
 * (현재는 단순 동기 계산이라 hook 으로 만들 필요는 없지만,
 *  추후 SWR 등으로 확장될 가능성을 위해 진입점만 노출.)
 */
export function useAccountVisibility(accountCount: number): AccountVisibilityResult {
    return getAccountVisibility({ accountCount })
}
