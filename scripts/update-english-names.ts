import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const KIS_BASE_URL = {
    REAL: 'https://openapi.koreainvestment.com:9443',
    VIRTUAL: 'https://openapivts.koreainvestment.com:29443',
}

const APP_KEY = process.env.KIS_APP_KEY
const APP_SECRET = process.env.KIS_APP_SECRET
const MODE = (process.env.KIS_MODE as 'REAL' | 'VIRTUAL') || 'REAL'
const BASE_URL = KIS_BASE_URL[MODE]

// Get KIS Access Token
async function getAccessToken(): Promise<string> {
    console.log('Fetching KIS Access Token...')

    const response = await fetch(`${BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            appkey: APP_KEY,
            appsecret: APP_SECRET,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get token: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    return data.access_token
}

// Fetch English name for a single stock
async function fetchEnglishName(token: string, stockCode: string): Promise<string | null> {
    const path = '/uapi/domestic-stock/v1/quotations/search-info'
    const tr_id = 'CTPF1002R'

    const params = new URLSearchParams({
        PDNO: stockCode,      // 상품번호 (종목코드)
        PRDT_TYPE_CD: '300'   // 상품유형코드 (주식)
    })

    try {
        const response = await fetch(`${BASE_URL}${path}?${params}`, {
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${token}`,
                appkey: APP_KEY!,
                appsecret: APP_SECRET!,
                tr_id: tr_id,
            },
        })

        if (!response.ok) {
            console.warn(`Failed to fetch ${stockCode}: ${response.status}`)
            return null
        }

        const data = await response.json()

        if (data.rt_cd !== '0') {
            console.warn(`KIS API Error for ${stockCode}: ${data.msg1}`)
            return null
        }

        return data.output?.prdt_eng_name || null
    } catch (error) {
        console.error(`Error fetching ${stockCode}:`, error)
        return null
    }
}

// Update English names for all stocks
async function updateEnglishNames() {
    try {
        const token = await getAccessToken()

        // Get all stocks without English names
        const stocks = await prisma.kisStockMaster.findMany({
            where: {
                OR: [
                    { engName: null },
                    { engName: '' }
                ]
            },
            orderBy: { stockCode: 'asc' }
        })

        console.log(`Found ${stocks.length} stocks without English names`)

        let successCount = 0
        let failCount = 0

        for (let i = 0; i < stocks.length; i++) {
            const stock = stocks[i]

            console.log(`[${i + 1}/${stocks.length}] Processing ${stock.stockCode} (${stock.stockName})...`)

            const engName = await fetchEnglishName(token, stock.stockCode)

            if (engName) {
                await prisma.kisStockMaster.update({
                    where: { stockCode: stock.stockCode },
                    data: { engName }
                })
                console.log(`  ✓ Updated: ${engName}`)
                successCount++
            } else {
                console.log(`  ✗ No English name found`)
                failCount++
            }

            // Rate limit: 20 requests per second max, so wait 100ms between requests
            await new Promise(resolve => setTimeout(resolve, 100))

            // Progress update every 50 stocks
            if ((i + 1) % 50 === 0) {
                console.log(`\nProgress: ${i + 1}/${stocks.length} (Success: ${successCount}, Failed: ${failCount})\n`)
            }
        }

        console.log('\n=== Update Complete ===')
        console.log(`Total: ${stocks.length}`)
        console.log(`Success: ${successCount}`)
        console.log(`Failed: ${failCount}`)

    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

// Run the script
updateEnglishNames()
