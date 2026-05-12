import fs from 'fs'
import path from 'path'
import https from 'https'
import AdmZip from 'adm-zip'
import iconv from 'iconv-lite'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DOWNLOAD_DIR = path.join(process.cwd(), 'tmp')
const BASE_URL = 'https://new.real.download.dws.co.kr/common/master'

// Advisory lock key — 다른 인스턴스의 동시 실행을 막는다.
// 32-bit int 범위 안에서 적당한 고유값. 다른 작업과 충돌 가능성 없는 임의값.
const ADVISORY_LOCK_KEY = 91733512

// stale running row 로 간주할 시간. 스크립트가 죽거나 GitHub Actions 가 시간 초과로 끝나면
// 후속 실행이 영원히 차단되는 사고를 막는다.
const STALE_RUNNING_TIMEOUT_MS = 30 * 60 * 1000 // 30 분

// 각 market 의 최소 합리 row 수 — 이 이하면 다운로드 실패/파일 손상으로 간주하고 abort.
// 현재 운영 DB row count 의 약 60% 수준으로 보수적 설정. KIS 가 정상 갱신해도 이만큼 떨어지진 않는다.
const MIN_EXPECTED: Record<string, number> = {
    KOSPI: 1500,
    KOSDAQ: 1000,
    NASD: 3000,
    NYSE: 1500,
    AMEX: 2000,
}

// 직전 row count 대비 이 비율 미만이면 anomaly 로 간주 (상장 폐지 이상 패턴 감지).
const ANOMALY_DROP_RATIO = 0.7 // 30% 이상 감소 시 abort

// KIS Master File Specs
// KR: EUC-KR 인코딩 + fixed-width. shortCode(0..9) + name(21..)
// US: CP949 인코딩 + 탭 구분 23개 컬럼. Symbol(4), Korea name(6), English name(7).
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

interface ParsedStock {
    stockCode: string
    stockName: string
    engName: string | null
    market: string
}

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest)
        https
            .get(url, (response) => {
                response.pipe(file)
                file.on('finish', () => {
                    file.close()
                    resolve()
                })
            })
            .on('error', (err) => {
                fs.unlink(dest, () => {})
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
function parseKrMasterFile(dbMarket: string, filePath: string): ParsedStock[] {
    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'EUC-KR')
    const lines = content.split('\n')

    const stocks: ParsedStock[] = []
    for (const line of lines) {
        if (line.length < 10) continue

        const shortCode = line.substring(0, 9).trim()
        const namePart = line.substring(21)
        // 이름 뒤 2칸 이상 공백을 구분자로 가비지(시장 코드 등) 제거.
        const cleanName = namePart.split(/\s{2,}/)[0].trim()

        if (shortCode && cleanName) {
            stocks.push({
                stockCode: shortCode,
                stockName: cleanName,
                engName: null,
                market: dbMarket,
            })
        }
    }
    return stocks
}

// 미국 마스터: CP949 + 탭 구분 23 컬럼.
// 컬럼: 0 National | 1 Exch id | 2 Exch code | 3 Exch name | 4 Symbol | 5 realtime
//       6 Korea name | 7 English name | 8 Security type | 9 Currency | 10~
function parseUsMasterFile(dbMarket: string, filePath: string): ParsedStock[] {
    const buffer = fs.readFileSync(filePath)
    const content = iconv.decode(buffer, 'CP949')
    const lines = content.split('\n')

    const stocks: ParsedStock[] = []
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
    return stocks
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

async function downloadAndParse(market: MarketSpec): Promise<ParsedStock[]> {
    const zipPath = path.join(DOWNLOAD_DIR, market.file)
    const extractPath = path.join(DOWNLOAD_DIR, market.name)

    console.log(`[${market.dbMarket}] downloading ${market.file}...`)
    await downloadFile(`${BASE_URL}/${market.file}`, zipPath)

    console.log(`[${market.dbMarket}] unzipping...`)
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractPath, true)

    const mstFile = resolveExtractedFile(extractPath, market.target)
    if (!mstFile) {
        throw new Error(
            `[${market.dbMarket}] master file not found in ${extractPath} (expected ${market.target})`,
        )
    }

    const parsed =
        market.region === 'kr'
            ? parseKrMasterFile(market.dbMarket, mstFile)
            : parseUsMasterFile(market.dbMarket, mstFile)

    console.log(`[${market.dbMarket}] parsed ${parsed.length} rows`)
    return parsed
}

// 사전 검증 — 적용 전 모든 market 데이터 일관성 확인. 한 줄이라도 abort 면 전체 중단.
async function validateAll(parsedByMarket: Record<string, ParsedStock[]>): Promise<void> {
    for (const [dbMarket, parsed] of Object.entries(parsedByMarket)) {
        if (parsed.length === 0) {
            throw new Error(`[${dbMarket}] empty file — aborting all`)
        }

        const min = MIN_EXPECTED[dbMarket] ?? 0
        if (parsed.length < min) {
            throw new Error(`[${dbMarket}] only ${parsed.length} rows (expected ≥${min}) — aborting all`)
        }

        const prevCount = await prisma.kisStockMaster.count({ where: { market: dbMarket } })
        if (prevCount > 0 && parsed.length < prevCount * ANOMALY_DROP_RATIO) {
            const pct = Math.round((1 - parsed.length / prevCount) * 100)
            throw new Error(
                `[${dbMarket}] row count dropped ${prevCount} → ${parsed.length} (-${pct}%) — anomaly threshold exceeded, aborting all`,
            )
        }
    }
}

// market 단위 트랜잭션으로 delete + insert. advisory lock 으로 동시 실행 가드.
async function applyMarket(dbMarket: string, stocks: ParsedStock[]): Promise<void> {
    await prisma.$transaction(
        async (tx) => {
            // 트랜잭션 범위 advisory lock — 같은 키를 다른 인스턴스가 잡고 있으면 대기.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`

            await tx.kisStockMaster.deleteMany({ where: { market: dbMarket } })
            for (const batch of chunk(stocks, 1000)) {
                await tx.kisStockMaster.createMany({ data: batch, skipDuplicates: true })
            }
        },
        { timeout: 60_000, maxWait: 10_000 },
    )
}

async function main() {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR)
    }

    const triggeredBy = process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'manual'
    let syncLogId: string | null = null

    try {
        // 1) 동시 실행 차단 — 최근 30분 안의 running row 가 있으면 abort.
        const running = await prisma.kisMasterSyncLog.findFirst({
            where: {
                status: 'running',
                startedAt: { gt: new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS) },
            },
        })
        if (running) {
            throw new Error(
                `another sync is in progress (started ${running.startedAt.toISOString()}), aborting`,
            )
        }

        // 2) SyncLog 생성 — 진행 중 상태 마크.
        const log = await prisma.kisMasterSyncLog.create({
            data: { status: 'running', triggeredBy },
        })
        syncLogId = log.id
        console.log(`\nsync log id: ${syncLogId}, triggeredBy: ${triggeredBy}\n`)

        // 3) 모든 market 다운로드 + 파싱 (메모리에 적재).
        //    한 곳이라도 실패하면 throw — DB 는 아직 안 건드림.
        const parsedByMarket: Record<string, ParsedStock[]> = {}
        for (const market of MARKETS) {
            parsedByMarket[market.dbMarket] = await downloadAndParse(market)
        }

        // 4) 사전 검증 — 0건/너무 적음/급격한 감소 탐지.
        console.log('\nvalidating all parsed data...')
        await validateAll(parsedByMarket)
        console.log('validation passed\n')

        // 5) 트랜잭션으로 market 단위 delete + insert (advisory lock 으로 동시 실행 가드).
        const rowCounts: Record<string, number> = {}
        for (const [dbMarket, parsed] of Object.entries(parsedByMarket)) {
            console.log(`[${dbMarket}] applying ${parsed.length} rows...`)
            await applyMarket(dbMarket, parsed)
            rowCounts[dbMarket] = parsed.length
            console.log(`[${dbMarket}] done`)
        }

        // 6) 성공 마크.
        await prisma.kisMasterSyncLog.update({
            where: { id: syncLogId },
            data: {
                status: 'success',
                finishedAt: new Date(),
                rowCounts,
            },
        })

        console.log('\nAll done. rowCounts:', rowCounts)
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('\nFailed:', errMsg)

        if (syncLogId) {
            // SyncLog 실패 마크 — 알림은 GitHub Actions failure step 이 담당.
            // update 자체가 실패해도 본 throw 를 우선 노출하기 위해 catch.
            await prisma.kisMasterSyncLog
                .update({
                    where: { id: syncLogId },
                    data: {
                        status: 'failed',
                        finishedAt: new Date(),
                        errorMessage: errMsg.slice(0, 4000),
                    },
                })
                .catch((e) => console.warn('failed to mark sync log as failed:', e))
        }

        // 비-zero exit code 로 GitHub Actions 의 failure() step 트리거.
        process.exitCode = 1
    } finally {
        await prisma.$disconnect()
    }
}

main()
