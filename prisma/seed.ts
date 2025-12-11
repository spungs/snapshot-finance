import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean up existing test data
  try {
    await prisma.stockHolding.deleteMany({})
    await prisma.portfolioSnapshot.deleteMany({})
    await prisma.holding.deleteMany({})
    // await prisma.securitiesAccount.deleteMany({}) // Removed
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
