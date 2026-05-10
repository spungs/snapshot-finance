import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

// SAFETY GUARD: 운영 DB wipe 방지 — localhost 가 아닌 DB 에는 절대 실행 금지.
// 본 파일의 deleteMany() 호출들이 조건 없는 전체 삭제를 수행하므로,
// .env 의 운영 DATABASE_URL 로 실수 실행 시 운영 데이터 영구 손실 위험.
const dbUrl = process.env.DATABASE_URL ?? ''
if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  console.error('SAFETY ABORT: seed.ts must run against a local database only.')
  console.error(`  DATABASE_URL host: ${dbUrl.match(/@([^/]+)/)?.[1] ?? 'unknown'}`)
  console.error('  Use `npm run seed:dev` (auto-loads .env.development.local) instead.')
  process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean up existing test data
  try {
    await prisma.snapshotHolding.deleteMany({})
    await prisma.portfolioSnapshot.deleteMany({})
    await prisma.holding.deleteMany({})
    await prisma.brokerageAccount.deleteMany({})
    await prisma.user.deleteMany({ where: { email: { in: ['test@example.com', 'free@example.com', 'pro@example.com', 'max@example.com'] } } })
  } catch (e) {
    console.log('Cleanup failed (start fresh):', e)
  }


  // 주요 종목 마스터 데이터
  const stocks = [
    { stockCode: '005930', stockName: '삼성전자', market: 'KOSPI', sector: '전기전자' },
    { stockCode: '000660', stockName: 'SK하이닉스', market: 'KOSPI', sector: '전기전자' },
    { stockCode: '035420', stockName: 'NAVER', market: 'KOSPI', sector: 'IT' },
    { stockCode: '005380', stockName: '현대차', market: 'KOSPI', sector: '자동차' },
    { stockCode: '051910', stockName: 'LG화학', market: 'KOSPI', sector: '화학' },
    { stockCode: '035720', stockName: '카카오', market: 'KOSPI', sector: 'IT' },
    { stockCode: '373220', stockName: 'LG에너지솔루션', market: 'KOSPI', sector: '전기전자' },
    { stockCode: '207940', stockName: '삼성바이오로직스', market: 'KOSPI', sector: '바이오' },
    { stockCode: '006400', stockName: '삼성SDI', market: 'KOSPI', sector: '전기전자' },
    { stockCode: '003670', stockName: '포스코퓨처엠', market: 'KOSPI', sector: '철강' },
  ]

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { stockCode: stock.stockCode },
      update: {},
      create: stock,
    })
  }
  console.log(`Created ${stocks.length} stocks`)

  // 테스트용 사용자 생성 (Free Plan)
  const freeUser = await prisma.user.upsert({
    where: { email: 'free@example.com' },
    update: {},
    create: {
      id: 'test-user-free',
      email: 'free@example.com',
      name: 'Free User',
    },
  })
  console.log(`Created user: ${freeUser.email}`)

  // 다중 계좌 시연용 BrokerageAccount 시드 (기본 계좌 + NH/키움)
  const defaultAccount = await prisma.brokerageAccount.create({
    data: { userId: freeUser.id, name: '기본 계좌', displayOrder: 0 },
  })
  await prisma.brokerageAccount.create({
    data: { userId: freeUser.id, name: 'NH투자증권', displayOrder: 1 },
  })
  await prisma.brokerageAccount.create({
    data: { userId: freeUser.id, name: '키움증권', displayOrder: 2 },
  })
  console.log(`Created 3 brokerage accounts for ${freeUser.email}`)
  console.log(`(default account id: ${defaultAccount.id})`)

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
