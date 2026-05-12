import fs from 'fs'
import path from 'path'
import https from 'https'
import AdmZip from 'adm-zip'
import iconv from 'iconv-lite'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

// Load env vars - prioritize .env for production DB as requested
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
// dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DOWNLOAD_DIR = path.join(process.cwd(), 'tmp')
const BASE_URL = 'https://new.real.download.dws.co.kr/common/master'

// KIS Master File Specs
// KR: EUC-KR 인코딩 + fixed-width. shortCode(0..9) + name(21..)
// US: CP949 인코딩 + 탭 구분 23개 컬럼. Symbol(4), Korea name(6), English name(7).
//     공식 KIS open-trading-api Python sample 의 컬럼 spec 참조.
type MarketSpec =
    | { region: 'kr'; name: string; file: string; target: string; dbMarket: string }
    | { region: 'us'; name: string; file: string; target: string; dbMarket: string }

const MARKETS: MarketSpec[] = [
    { region: 'kr', name: 'kospi', file: 'kospi_code.mst.zip', target: 'kospi_code.mst', dbMarket: 'KOSPI' },
    { region: 'kr', name: 'kosdaq', file: 'kosdaq_code.mst.zip', target: 'kosdaq_code.mst', dbMarket: 'KOSDAQ' },
    { region: 'us', name: 'nasd', file: 'nasmst.cod.zip', target: 'nasmst.cod', dbMarket: 'NASD' },
    { region: 'us', name: 'nyse', file: 'nysmst.cod.zip', target: 'nysmst.cod', dbMarket: 'NYSE' },
    { region: 'us', name: 'amex', file: 'amsmst.cod.zip', target: 'amsmst.cod', dbMarket: 'AMEX' },
]

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest)
        https.get(url, (response) => {
            response.pipe(file)
            file.on('finish', () => {
                file.close()
                resolve()
            })
        }).on('error', (err) => {
            fs.unlink(dest, () => { })
            reject(err)
        })
    })
}

// zip 내부 파일명이 예상과 다를 수 있어 확장자 기준 fallback 으로 첫 매칭 파일을 찾는다.
function resolveExtractedFile(extractPath: string, expectedTarget: string): string | null {
    const direct = path.join(extractPath, expectedTarget)
    if (fs.existsSync(direct)) return direct

    const ext = path.extname(expectedTarget).toLowerCase()
    if (!ext) return null
    try {
        const entries = fs.readdirSync(extractPath)
        const match = entries.find((e) => path.extname(e).toLowerCase() === ext)
        return match ? path.join(extractPath, match) : null
    } catch {
        return null
    }
}

// 한국 마스터: EUC-KR + fixed-width.
async function processKrMasterFile(dbMarket: string, filePath: string) {
    console.log(`Processing ${dbMarket} master file (KR fixed-width)...`)

    await prisma.kisStockMaster.deleteMany({ where: { market: dbMarket } })
    console.log(`Cleared existing ${dbMarket} data.`)

    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'EUC-KR')
    const lines = content.split('\n')

    const stocks: { stockCode: string; stockName: string; market: string; engName: string | null }[] = []

    for (const line of lines) {
        if (line.length < 10) continue

        const shortCode = line.substring(0, 9).trim()
        const namePart = line.substring(21)
        // 이름 뒤에 2칸 이상 공백을 구분자로 가비지(시장 코드 등) 제거.
        const cleanName = namePart.split(/\s{2,}/)[0].trim()

        if (shortCode && cleanName) {
            stocks.push({
                stockCode: shortCode,
                stockName: cleanName,
                market: dbMarket,
                engName: null,
            })
        }
    }

    console.log(`Found ${stocks.length} stocks in ${dbMarket}.`)

    const BATCH_SIZE = 1000
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE)
        await prisma.kisStockMaster.createMany({
            data: batch,
            skipDuplicates: true,
        })
    }
    console.log(`Saved ${dbMarket} stocks to DB.`)
}

// 미국 마스터: CP949 + 탭 구분 23 컬럼. KIS open-trading-api Python sample 의 컬럼 spec:
// 0 National code | 1 Exchange id | 2 Exchange code | 3 Exchange name | 4 Symbol | 5 realtime symbol
// 6 Korea name | 7 English name | 8 Security type | 9 Currency | 10~ Bid/Ask/Tick 등
async function processUsMasterFile(dbMarket: string, filePath: string) {
    console.log(`Processing ${dbMarket} master file (US tab-delimited)...`)

    await prisma.kisStockMaster.deleteMany({ where: { market: dbMarket } })
    console.log(`Cleared existing ${dbMarket} data.`)

    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'CP949')
    const lines = content.split('\n')

    const stocks: { stockCode: string; stockName: string; market: string; engName: string | null }[] = []
    const seen = new Set<string>()

    for (const line of lines) {
        if (!line.trim()) continue
        const cols = line.split('\t')
        if (cols.length < 8) continue

        const symbol = (cols[4] ?? '').trim()
        const koreaName = (cols[6] ?? '').trim()
        const englishName = (cols[7] ?? '').trim()
        if (!symbol) continue

        // 같은 dbMarket 안에서 symbol 중복 방지 — 마스터 파일에 동일 행이 가끔 들어옴.
        if (seen.has(symbol)) continue
        seen.add(symbol)

        stocks.push({
            stockCode: symbol,
            stockName: koreaName || englishName || symbol,
            engName: englishName || null,
            market: dbMarket,
        })
    }

    console.log(`Found ${stocks.length} stocks in ${dbMarket}.`)

    const BATCH_SIZE = 1000
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE)
        await prisma.kisStockMaster.createMany({
            data: batch,
            skipDuplicates: true,
        })
    }
    console.log(`Saved ${dbMarket} stocks to DB.`)
}

async function main() {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR)
    }

    try {
        for (const market of MARKETS) {
            const zipPath = path.join(DOWNLOAD_DIR, market.file)
            const extractPath = path.join(DOWNLOAD_DIR, market.name)

            console.log(`\n=== ${market.dbMarket} ===`)
            console.log(`Downloading ${market.file}...`)
            await downloadFile(`${BASE_URL}/${market.file}`, zipPath)

            console.log(`Unzipping ${market.name}...`)
            const zip = new AdmZip(zipPath)
            zip.extractAllTo(extractPath, true)

            const mstFile = resolveExtractedFile(extractPath, market.target)
            if (!mstFile) {
                console.error(`Master file not found in ${extractPath} (expected ${market.target}). Skipping.`)
                continue
            }

            if (market.region === 'kr') {
                await processKrMasterFile(market.dbMarket, mstFile)
            } else {
                await processUsMasterFile(market.dbMarket, mstFile)
            }
        }
        console.log('\nAll done!')
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
