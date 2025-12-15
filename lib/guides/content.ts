type Language = 'ko' | 'en'

export interface Guide {
    slug: string
    title: {
        ko: string
        en: string
    }
    description: {
        ko: string
        en: string
    }
    content: {
        ko: string
        en: string
    }
}

export const guides: Guide[] = [
    {
        slug: 'getting-started',
        title: {
            ko: '시작하기: Snapshot Finance 사용법',
            en: 'Getting Started: How to Use Snapshot Finance'
        },
        description: {
            ko: '구글 로그인부터 첫 스냅샷 저장까지, 서비스를 시작하는 방법을 단계별로 알려드립니다.',
            en: 'A step-by-step guide from Google login to saving your first snapshot.'
        },
        content: {
            ko: `## Snapshot Finance란?

Snapshot Finance는 주식 포트폴리오를 스냅샷으로 기록하고 관리할 수 있는 무료 서비스입니다. 매번 엑셀로 수익률을 계산하는 번거로움 없이, 간편하게 투자 현황을 파악하고 과거와 비교할 수 있습니다.

## 시작하기

### 1단계: 구글 로그인
메인 페이지에서 "내 포트폴리오 기록하기" 버튼을 클릭하면 구글 로그인 화면이 나타납니다. 구글 계정으로 간편하게 가입하고 로그인할 수 있습니다.

### 2단계: 보유 종목 추가하기
대시보드에서 "종목 추가" 버튼을 클릭합니다. 종목 검색창에 종목명이나 코드를 입력하면 한국 주식과 미국 주식 모두 검색할 수 있습니다. 원하는 종목을 선택하고 수량과 평균 매수가를 입력하세요.

### 3단계: 스냅샷 저장하기
보유 종목 설정이 완료되면 "스냅샷" 탭에서 "새 스냅샷" 버튼을 클릭합니다. 현재 포트폴리오 상태가 자동으로 저장되며, 나중에 언제든 확인할 수 있습니다.

### 4단계: 수익률 확인하기
대시보드에서 현재 평가액, 평가손익, 수익률을 실시간으로 확인할 수 있습니다. 과거 스냅샷과 비교하여 투자 성과를 분석해보세요.

## 주요 기능

- **실시간 시세 연동**: 한국투자증권 API를 통해 실시간 주가를 자동으로 가져옵니다.
- **다양한 통화 지원**: 원화(KRW)와 달러(USD)로 표시를 전환할 수 있습니다.
- **스냅샷 비교**: 과거 스냅샷과 현재를 비교하여 성과를 분석할 수 있습니다.
- **시뮬레이션**: "만약에" 기능으로 가상 시나리오를 테스트할 수 있습니다.

이제 Snapshot Finance로 투자 기록을 시작해보세요!`,
            en: `## What is Snapshot Finance?

Snapshot Finance is a free service that allows you to record and manage your stock portfolio as snapshots. You can easily track your investment status and compare with the past without the hassle of calculating returns in Excel.

## Getting Started

### Step 1: Google Login
Click the "Record My Portfolio" button on the main page to see the Google login screen. You can easily sign up and log in with your Google account.

### Step 2: Add Holdings
Click the "Add Stock" button on the dashboard. Enter the stock name or code in the search bar to find both Korean and US stocks. Select the desired stock and enter the quantity and average purchase price.

### Step 3: Save Snapshot
Once your holdings are set up, click the "New Snapshot" button in the "Snapshots" tab. Your current portfolio status will be automatically saved and can be viewed at any time.

### Step 4: Check Returns
You can view current valuation, profit/loss, and returns in real-time on the dashboard. Compare with past snapshots to analyze your investment performance.

## Key Features

- **Real-time Price Updates**: Real-time stock prices are automatically fetched through the Korea Investment Securities API.
- **Multiple Currency Support**: You can switch between KRW and USD display.
- **Snapshot Comparison**: Compare past snapshots with the current state to analyze performance.
- **Simulation**: Test hypothetical scenarios with the "What If" feature.

Start recording your investments with Snapshot Finance today!`
        }
    },
    {
        slug: 'snapshot-importance',
        title: {
            ko: '포트폴리오 스냅샷의 중요성',
            en: 'The Importance of Portfolio Snapshots'
        },
        description: {
            ko: '왜 투자 기록을 남겨야 할까요? 스냅샷을 통해 과거의 투자 결정을 분석하고, 성공과 실패를 배울 수 있습니다.',
            en: 'Why should you keep investment records? Learn from your successes and failures by analyzing past investment decisions.'
        },
        content: {
            ko: `## 왜 투자 기록이 중요한가?

많은 투자자들이 "지금 내 수익률이 얼마지?"라는 질문에 명확하게 답하지 못합니다. 그리고 "작년 이맘때 내 포트폴리오는 어땠지?"라는 질문에는 더더욱 답하기 어렵습니다.

투자 기록을 남기는 것은 단순히 숫자를 저장하는 것이 아닙니다. **과거의 자신에게서 배우는 과정**입니다.

## 스냅샷의 가치

### 1. 의사결정 분석
과거 특정 시점의 포트폴리오를 기록해두면, 그때의 투자 결정이 옳았는지 분석할 수 있습니다. "그때 왜 그 종목을 샀지?", "왜 그때 팔지 않았지?"라는 질문에 데이터로 답할 수 있습니다.

### 2. 감정적 투자 방지
기록을 남기면 자신이 얼마나 감정적으로 투자했는지 객관적으로 볼 수 있습니다. 공포에 팔고 탐욕에 사는 패턴을 발견할 수 있습니다.

### 3. 장기 성과 추적
시간이 지나면 자신의 투자 실력이 향상되었는지, 복리 효과가 어떻게 작용하는지 직접 확인할 수 있습니다.

### 4. 리밸런싱 시점 파악
자산 배분의 변화를 추적하면 리밸런싱이 필요한 시점을 쉽게 파악할 수 있습니다.

## 언제 스냅샷을 저장해야 할까?

- **정기적으로**: 매주 또는 매달 정해진 날에 저장
- **중요한 이벤트 시**: 큰 매매 후, 시장 급변 시
- **목표 달성 시**: 수익률 목표 달성, 자산 목표 달성 시

## 결론

투자는 마라톤입니다. 단거리 성과에 일희일비하지 않고, 장기적인 관점에서 자신의 투자를 객관적으로 평가하려면 기록이 필수입니다. Snapshot Finance로 오늘부터 기록을 시작해보세요.`,
            en: `## Why Are Investment Records Important?

Many investors cannot clearly answer the question "What is my current return?" And it's even harder to answer "What was my portfolio like this time last year?"

Keeping investment records is not just about storing numbers. It's **a process of learning from your past self**.

## The Value of Snapshots

### 1. Decision Analysis
By recording your portfolio at a specific point in time, you can analyze whether your investment decisions were correct. You can answer questions like "Why did I buy that stock?" or "Why didn't I sell then?" with data.

### 2. Preventing Emotional Investing
Recording allows you to objectively see how emotionally you invested. You can discover patterns of selling in fear and buying in greed.

### 3. Long-term Performance Tracking
Over time, you can directly see if your investing skills have improved and how compound interest works.

### 4. Identifying Rebalancing Points
Tracking changes in asset allocation makes it easy to identify when rebalancing is needed.

## When Should You Save Snapshots?

- **Regularly**: Save on a set day every week or month
- **At Important Events**: After major trades, during market volatility
- **When Goals Are Achieved**: When return targets or asset goals are met

## Conclusion

Investing is a marathon. To objectively evaluate your investments from a long-term perspective without getting caught up in short-term results, records are essential. Start recording today with Snapshot Finance.`
        }
    },
    {
        slug: 'profit-analysis',
        title: {
            ko: '수익률 분석 방법',
            en: 'How to Analyze Returns'
        },
        description: {
            ko: '평가액, 평가손익, 수익률을 정확하게 계산하고 해석하는 방법을 설명합니다.',
            en: 'Learn how to accurately calculate and interpret valuation, profit/loss, and returns.'
        },
        content: {
            ko: `## 수익률의 기본 개념

투자 수익률을 이해하는 것은 성공적인 투자의 첫걸음입니다. 하지만 많은 투자자들이 수익률을 정확하게 계산하지 못하거나, 잘못 해석하는 경우가 많습니다.

## 핵심 용어 정리

### 평가액 (Valuation)
보유 중인 자산의 현재 시장 가치입니다.
- **계산식**: 현재가 × 보유 수량

### 평가손익 (Profit/Loss)
투자 원금 대비 현재 이익 또는 손실입니다.
- **계산식**: 평가액 - (평균 매수가 × 보유 수량)

### 수익률 (Return Rate)
투자 원금 대비 이익의 비율입니다.
- **계산식**: (평가손익 ÷ 투자 원금) × 100%

## 수익률 해석 시 주의사항

### 1. 실현 수익 vs 미실현 수익
평가손익은 **미실현 수익**입니다. 실제로 매도하기 전까지는 확정된 수익이 아닙니다.

### 2. 세금과 수수료
실제 수익률은 거래 수수료와 세금을 고려해야 합니다. 미국 주식의 경우 양도소득세(22%, 연 250만원 기본공제)를 고려해야 실제 손익을 알 수 있습니다.

### 3. 환율 영향
해외 주식의 경우 환율 변동이 수익률에 큰 영향을 미칩니다. 달러 강세 시 원화 환산 수익률이 높아지고, 달러 약세 시 낮아집니다.

## 복리의 마법

장기 투자에서 가장 중요한 개념은 **복리**입니다.

| 기간 | 연 10% 단리 | 연 10% 복리 |
|------|------------|------------|
| 10년 | 100% | 159% |
| 20년 | 200% | 573% |
| 30년 | 300% | 1,645% |

복리 효과를 최대화하려면 장기 투자와 배당 재투자가 중요합니다.

## Snapshot Finance에서 수익률 확인하기

Snapshot Finance는 각 종목별 수익률과 전체 포트폴리오 수익률을 자동으로 계산해줍니다. 스냅샷을 통해 시간에 따른 수익률 변화도 확인할 수 있습니다.`,
            en: `## Basic Concepts of Returns

Understanding investment returns is the first step to successful investing. However, many investors either cannot calculate returns accurately or misinterpret them.

## Key Terms

### Valuation
The current market value of your assets.
- **Formula**: Current Price × Quantity Held

### Profit/Loss
The gain or loss compared to your principal investment.
- **Formula**: Valuation - (Average Purchase Price × Quantity Held)

### Return Rate
The ratio of profit to principal investment.
- **Formula**: (Profit/Loss ÷ Principal) × 100%

## Important Notes on Interpreting Returns

### 1. Realized vs Unrealized Gains
Profit/Loss is an **unrealized gain**. It's not a confirmed profit until you actually sell.

### 2. Taxes and Fees
Actual returns should consider trading fees and taxes. For US stocks, you need to consider capital gains tax (22% in Korea, after 2.5M KRW basic deduction) to know the real profit.

### 3. Exchange Rate Impact
For foreign stocks, exchange rate fluctuations significantly affect returns. When the dollar strengthens, KRW-converted returns increase, and vice versa.

## The Magic of Compound Interest

The most important concept in long-term investing is **compound interest**.

| Period | 10% Simple Interest | 10% Compound Interest |
|--------|--------------------|-----------------------|
| 10 years | 100% | 159% |
| 20 years | 200% | 573% |
| 30 years | 300% | 1,645% |

To maximize compound effects, long-term investing and dividend reinvestment are crucial.

## Checking Returns in Snapshot Finance

Snapshot Finance automatically calculates returns for each stock and your overall portfolio. You can also track changes in returns over time through snapshots.`
        }
    },
    {
        slug: 'simulation',
        title: {
            ko: '시뮬레이션 기능 활용법',
            en: 'How to Use the Simulation Feature'
        },
        description: {
            ko: '"만약에" 기능으로 과거 스냅샷을 현재 시점으로 재평가해보세요.',
            en: 'Re-evaluate past snapshots at current prices with the "What If" feature.'
        },
        content: {
            ko: `## "만약에" 기능이란?

Snapshot Finance의 시뮬레이션 기능은 과거 스냅샷을 현재 주가로 재평가할 수 있는 강력한 도구입니다. "그때 팔지 않았다면 지금 얼마였을까?"라는 질문에 답할 수 있습니다.

## 사용 방법

### 1단계: 스냅샷 선택
시뮬레이션 탭에서 분석하고 싶은 과거 스냅샷을 선택합니다.

### 2단계: 시뮬레이션 실행
선택한 스냅샷의 보유 종목들이 현재 시가로 재계산됩니다.

### 3단계: 결과 분석
과거 시점의 평가액과 현재 시점의 평가액을 비교합니다. 각 종목별로 얼마나 올랐는지/내렸는지 확인할 수 있습니다.

## 활용 사례

### 사례 1: 매도 시점 분석
"작년에 테슬라를 팔았는데, 팔지 않았다면?"
→ 시뮬레이션으로 현재 평가액을 확인하여 매도 결정이 옳았는지 분석

### 사례 2: 포트폴리오 구성 비교
"과거 포트폴리오를 유지했다면 현재 수익률은?"
→ 과거 자산 배분이 현재까지 유효한지 검증

### 사례 3: 리밸런싱 효과 검증
"리밸런싱하지 않았다면?"
→ 리밸런싱 전후의 성과 비교

## 주의사항

- 시뮬레이션은 과거 보유 수량만으로 계산합니다
- 배당금, 추가 매수 등은 반영되지 않습니다
- 과거 결과가 미래를 보장하지 않습니다

## 결론

시뮬레이션 기능은 과거의 투자 결정을 객관적으로 평가하는 도구입니다. 후회하기 위한 것이 아니라, 더 나은 투자 결정을 내리기 위한 학습 도구로 활용하세요.`,
            en: `## What is the "What If" Feature?

The simulation feature in Snapshot Finance is a powerful tool that allows you to re-evaluate past snapshots at current prices. You can answer questions like "What if I hadn't sold then?"

## How to Use

### Step 1: Select a Snapshot
Choose the past snapshot you want to analyze in the Simulation tab.

### Step 2: Run Simulation
The holdings in the selected snapshot are recalculated at current market prices.

### Step 3: Analyze Results
Compare the valuation at the past point with the current valuation. You can see how much each stock has risen or fallen.

## Use Cases

### Case 1: Analyzing Selling Points
"I sold Tesla last year, what if I hadn't?"
→ Check current valuation with simulation to analyze if the selling decision was correct

### Case 2: Portfolio Composition Comparison
"What would be my current return if I had kept my old portfolio?"
→ Verify if past asset allocation is still valid

### Case 3: Rebalancing Effect Verification
"What if I hadn't rebalanced?"
→ Compare performance before and after rebalancing

## Notes

- Simulation calculates based only on past quantities held
- Dividends, additional purchases, etc. are not reflected
- Past results do not guarantee future performance

## Conclusion

The simulation feature is a tool for objectively evaluating past investment decisions. Use it not for regret, but as a learning tool for making better investment decisions in the future.`
        }
    },
    {
        slug: 'rebalancing',
        title: {
            ko: '포트폴리오 리밸런싱 가이드',
            en: 'Portfolio Rebalancing Guide'
        },
        description: {
            ko: '자산 배분을 재조정하는 리밸런싱의 개념과 실행 방법을 설명합니다.',
            en: 'Learn about the concept and execution of rebalancing to readjust asset allocation.'
        },
        content: {
            ko: `## 리밸런싱이란?

리밸런싱(Rebalancing)은 포트폴리오의 자산 배분을 원래 목표로 되돌리는 과정입니다. 시간이 지나면 자산별 수익률 차이로 비중이 변하게 되는데, 이를 조정하는 것입니다.

## 왜 리밸런싱이 필요한가?

### 1. 리스크 관리
특정 자산의 비중이 과도하게 커지면 해당 자산의 하락 시 포트폴리오 전체가 큰 타격을 받습니다.

### 2. "고점에 팔고 저점에 사기"
리밸런싱은 자연스럽게 오른 자산을 팔고 내린 자산을 사는 효과가 있습니다.

### 3. 투자 원칙 유지
감정에 휘둘리지 않고 원래 계획한 배분을 유지할 수 있습니다.

## 리밸런싱 방법

### 방법 1: 시간 기준
정해진 주기(분기별, 반기별, 연간)로 리밸런싱합니다.
- **장점**: 단순하고 실행하기 쉬움
- **단점**: 시장 상황과 무관하게 진행

### 방법 2: 비중 기준
목표 비중에서 일정 수준(예: 5%) 이상 벗어나면 리밸런싱합니다.
- **장점**: 필요할 때만 거래
- **단점**: 지속적인 모니터링 필요

### 방법 3: 현금 흐름 활용
추가 투자금이 들어올 때 비중이 낮은 자산을 매수합니다.
- **장점**: 매도 없이 리밸런싱 가능
- **단점**: 큰 비중 차이는 해소 어려움

## 리밸런싱 시 고려사항

### 1. 세금과 수수료
매도 시 발생하는 세금과 거래 수수료를 고려해야 합니다.

### 2. 거래 빈도
너무 자주 리밸런싱하면 비용이 많이 들고, 너무 드물면 효과가 줄어듭니다.

### 3. 목표 비중 재검토
정기적으로 목표 자산 배분이 여전히 적절한지 검토하세요.

## Snapshot Finance에서 리밸런싱 관리하기

Snapshot Finance는 리밸런싱을 돕는 강력한 도구를 제공합니다:

- **비중(Weight) 확인**: 대시보드와 스냅샷 상세 페이지에서 각 종목의 비중을 실시간으로 확인할 수 있습니다.
- **포트폴리오 비교**: 스냅샷 목록 하단의 '포트폴리오 비교' 기능을 통해 현재 포트폴리오와 과거 스냅샷, 또는 과거 스냅샷 간의 차이(수량 변동, 신규 편입/삭제)를 한눈에 파악할 수 있습니다. 정기적으로 스냅샷을 저장하고 이를 활용하여 리밸런싱 계획을 세워보세요.`,
            en: `## What is Rebalancing?

Rebalancing is the process of restoring your portfolio's asset allocation to its original target. Over time, the weights change due to different returns on different assets, and rebalancing adjusts this.

## Why is Rebalancing Necessary?

### 1. Risk Management
If the weight of a particular asset becomes too large, the entire portfolio takes a big hit when that asset falls.

### 2. "Sell High, Buy Low"
Rebalancing naturally has the effect of selling assets that have risen and buying assets that have fallen.

### 3. Maintaining Investment Principles
You can maintain your originally planned allocation without being swayed by emotions.

## Rebalancing Methods

### Method 1: Time-Based
Rebalance at set intervals (quarterly, semi-annually, annually).
- **Pros**: Simple and easy to execute
- **Cons**: Proceeds regardless of market conditions

### Method 2: Threshold-Based
Rebalance when you deviate more than a certain level (e.g., 5%) from target weights.
- **Pros**: Trade only when needed
- **Cons**: Requires continuous monitoring

### Method 3: Cash Flow Utilization
Buy underweight assets when additional investment money comes in.
- **Pros**: Can rebalance without selling
- **Cons**: Difficult to resolve large weight differences

## Considerations When Rebalancing

### 1. Taxes and Fees
Consider taxes and trading fees incurred when selling.

### 2. Trading Frequency
Rebalancing too often is costly, while too infrequently reduces effectiveness.

### 3. Target Weight Review
Regularly review whether your target asset allocation is still appropriate.

## Managing Rebalancing in Snapshot Finance

Snapshot Finance provides powerful tools to help with rebalancing:

- **Check Weights**: You can view the weight of each stock in real-time on the Dashboard and Snapshot Detail pages.
- **Portfolio Comparison**: Use the 'Portfolio Comparison' feature at the bottom of the Snapshot list to see differences (quantity changes, additions/removals) between your current portfolio and past snapshots, or between two past snapshots. Regularly save snapshots and use these tools to plan your rebalancing.`
        }
    }
]

export function getGuideBySlug(slug: string): Guide | undefined {
    return guides.find(guide => guide.slug === slug)
}

export function getGuideContent(guide: Guide, language: Language): {
    title: string
    description: string
    content: string
} {
    return {
        title: guide.title[language],
        description: guide.description[language],
        content: guide.content[language]
    }
}
