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
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
// dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DOWNLOAD_DIR = path.join(process.cwd(), 'tmp')
const BASE_URL = 'https://new.real.download.dws.co.kr/common/master'

// KIS Master File Specs
const MARKETS = [
    { name: 'kospi', file: 'kospi_code.mst.zip', target: 'kospi_code.mst' },
    { name: 'kosdaq', file: 'kosdaq_code.mst.zip', target: 'kosdaq_code.mst' },
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

async function processMasterFile(marketName: string, filePath: string) {
    console.log(`Processing ${marketName} master file...`)

    // Clear existing data for this market to ensure updates
    await prisma.kisStockMaster.deleteMany({
        where: { market: marketName.toUpperCase() }
    })
    console.log(`Cleared existing ${marketName} data.`)

    // Read file with EUC-KR encoding
    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'EUC-KR')
    const lines = content.split('\n')

    const stocks = []

    for (const line of lines) {
        if (line.length < 10) continue

        // Parse based on fixed width (approximate based on common KIS spec)
        // KOSPI/KOSDAQ: 
        // Code: 0-9 (usually 6 digits + spaces) -> actually standard code is 9 chars in file usually
        // Let's use tab split or fixed width. KIS master is usually fixed width.
        // Spec:
        // 1. Short Code (9)
        // 2. Standard Code (12)
        // 3. Name (Hangul) (variable? usually fixed)

        // Actually, let's try to split by some delimiter if possible, but .mst is usually fixed width.
        // Based on KIS GitHub sample:
        // length: row[0:9] -> short code
        // row[21:something] -> name

        // Let's try a safer approach: standard code is usually at the beginning.
        // Let's assume:
        // Col 1: Short Code (9 bytes)
        // Col 2: Standard Code (12 bytes)
        // Col 3: Name (Hangul) (variable length, but usually follows)

        // Wait, KIS provides a python sample. Let's use the logic from there if possible.
        // Python sample:
        // mksc_shrn_iscd = row[0:9]  (Short Code)
        // hts_kor_isnm = row[21:].strip() (Korean Name - simplified)

        // Let's try to parse:
        const shortCode = line.substring(0, 9).trim()
        // const standardCode = line.substring(9, 21).trim()

        // Name parsing:
        // The name starts at index 21.
        // It is followed by padding spaces and then other fields (garbage).
        // We split by 2 or more spaces to separate the name from the rest.
        let namePart = line.substring(21);

        // Split by multiple spaces to isolate the name
        // This handles cases like "Samsung Elec   ST..." -> "Samsung Elec"
        const cleanName = namePart.split(/\s{2,}/)[0].trim();

        // Name might contain other info at the end, but usually it's the name.
        // Let's take the name part. KIS master file structure is complex.
        // For now, let's try to extract name. 
        // Actually, let's look at the file content structure by logging first few lines if this fails.
        // But for now, let's assume the name starts at 21.

        // We need to be careful about English name. It might not be in this file.
        // KIS master file usually has:
        // 0-9: Short Code
        // 9-21: Standard Code
        // 21-?: Korean Name

        // Let's just save short code and name for now.
        // We need to filter out futures/options if mixed, but kospi_code.mst usually has equities.

        if (shortCode && cleanName) {
            stocks.push({
                stockCode: shortCode, // We use short code (e.g. 005930) for search usually
                stockName: cleanName, // This might need trimming of trailing garbage
                market: marketName.toUpperCase(),
                engName: null // Master file might not have it easily accessible in this simple parse
            })
        }
    }

    console.log(`Found ${stocks.length} stocks in ${marketName}.`)

    // Batch insert
    // Prisma createMany is efficient
    const BATCH_SIZE = 1000
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE)
        await prisma.kisStockMaster.createMany({
            data: batch,
            skipDuplicates: true,
        })
    }
    console.log(`Saved ${marketName} stocks to DB.`)
}

async function main() {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR)
    }

    try {
        for (const market of MARKETS) {
            const zipPath = path.join(DOWNLOAD_DIR, market.file)
            const extractPath = path.join(DOWNLOAD_DIR, market.name)

            console.log(`Downloading ${market.name}...`)
            await downloadFile(`${BASE_URL}/${market.file}`, zipPath)

            console.log(`Unzipping ${market.name}...`)
            const zip = new AdmZip(zipPath)
            zip.extractAllTo(extractPath, true)

            const mstFile = path.join(extractPath, market.target)
            if (fs.existsSync(mstFile)) {
                await processMasterFile(market.name, mstFile)
            } else {
                console.error(`Master file not found: ${mstFile}`)
            }
        }
        console.log('All done!')
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
