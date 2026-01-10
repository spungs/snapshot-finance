import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import iconv from 'iconv-lite'

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const MSTS_DIR = path.join(__dirname, 'msts')

// US Stock Master Files
const US_FILES = [
    { file: 'NASMST.COD', market: 'NASD', name: 'NASDAQ' },
    { file: 'NYSMST.COD', market: 'NYSE', name: 'New York Stock Exchange' },
    { file: 'AMSMST.COD', market: 'AMEX', name: 'American Stock Exchange' },
]

interface StockData {
    stockCode: string
    stockName: string
    engName: string | null
    market: string
}

async function parseMasterFile(filePath: string, market: string): Promise<StockData[]> {
    console.log(`Parsing ${filePath}...`)

    // Read file with EUC-KR encoding (Korean encoding used by KIS)
    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'EUC-KR')
    const lines = content.split('\n')

    const stocks: StockData[] = []

    for (const line of lines) {
        if (line.length < 10) continue

        // KIS Master file is tab-delimited
        // Sample line structure (from head output):
        // US\t22\tNAS\t�\tAACB\tNASAACB\t[Korean Name]\t[English Name]\t...
        // Fields we need:
        // Field 5 (index 4): Stock Code (e.g., AACB)
        // Field 8 (index 7): English Name (e.g., ARTIUS II ACQUISITION INC)
        // Field 7 (index 6): Korean Name (한글 종목명)

        const fields = line.split('\t')

        if (fields.length < 8) continue

        const stockCode = fields[4]?.trim()
        const koreanName = fields[6]?.trim()
        const englishName = fields[7]?.trim()

        // Filter out empty or invalid codes
        if (!stockCode || stockCode.length === 0) continue

        // Skip codes with special characters that might indicate index/etc
        if (stockCode.includes(' ') || stockCode.includes('.')) continue

        stocks.push({
            stockCode: stockCode,
            stockName: koreanName || englishName || stockCode, // Prefer Korean, fallback to English or code
            engName: englishName || null,
            market: market,
        })
    }

    console.log(`Found ${stocks.length} stocks in ${market}`)
    return stocks
}

async function main() {
    try {
        for (const fileInfo of US_FILES) {
            const filePath = path.join(MSTS_DIR, fileInfo.file)

            if (!fs.existsSync(filePath)) {
                console.warn(`File not found: ${filePath}`)
                continue
            }

            console.log(`\n=== Processing ${fileInfo.name} (${fileInfo.market}) ===`)

            // Clear existing data for this market
            await prisma.kisStockMaster.deleteMany({
                where: { market: fileInfo.market }
            })
            console.log(`Cleared existing ${fileInfo.market} data.`)

            // Parse file
            const stocks = await parseMasterFile(filePath, fileInfo.market)

            if (stocks.length === 0) {
                console.log(`No stocks found in ${fileInfo.market}`)
                continue
            }

            // Save to DB in batches
            const BATCH_SIZE = 500
            for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
                const batch = stocks.slice(i, i + BATCH_SIZE)
                await prisma.kisStockMaster.createMany({
                    data: batch,
                    skipDuplicates: true,
                })
                console.log(`  Saved batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stocks.length / BATCH_SIZE)}`)
            }

            console.log(`✓ Saved ${stocks.length} ${fileInfo.market} stocks to DB.`)
        }

        console.log('\n✅ All done!')
        console.log('\nSummary:')
        const counts = await Promise.all(
            US_FILES.map(async (f) => ({
                market: f.market,
                count: await prisma.kisStockMaster.count({ where: { market: f.market } })
            }))
        )
        counts.forEach(c => console.log(`  ${c.market}: ${c.count} stocks`))

    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main()
