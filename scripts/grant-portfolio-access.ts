/**
 * 포트폴리오 위임 접근(PortfolioAccess) grant 를 생성/갱신하는 일회성 스크립트.
 *
 * "연결" 은 스키마 변경이나 소스 하드코딩이 아니라 이 테이블의 행(row) 하나로 표현된다.
 * 실제 user id 는 소스에 남기지 않고 실행 인자로만 전달한다.
 *
 * 사용법:
 *   npx tsx scripts/grant-portfolio-access.ts --owner-id <ownerUserId> --grantee-email <email> [--role editor]
 *   npx tsx scripts/grant-portfolio-access.ts --owner-id <ownerUserId> --grantee-id <granteeUserId>
 *   npx tsx scripts/grant-portfolio-access.ts --list                 # 현재 grant 전체 조회
 *   npx tsx scripts/grant-portfolio-access.ts --revoke --owner-id <..> --grantee-email <..>
 *
 * 대상 DB 는 .env 의 DATABASE_URL (기본: 운영 Supabase). 다른 DB 로 실행하려면
 *   dotenv -e .env.development.local -- npx tsx scripts/grant-portfolio-access.ts ...
 */
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

// 이미 DATABASE_URL 이 주입돼 있으면(dotenv -e <file> -- 로 다른 DB 지정) 그대로 사용하고,
// 없을 때만 .env(기본: 운영 Supabase)를 로드한다. override 하지 않아 로컬 드라이런이 안전하다.
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// --flag value / --flag=value / boolean --flag 모두 파싱
function parseArgs(argv: string[]): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = {}
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) continue
        const key = a.slice(2)
        const eq = key.indexOf('=')
        if (eq >= 0) {
            out[key.slice(0, eq)] = key.slice(eq + 1)
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
            out[key] = argv[++i]
        } else {
            out[key] = true
        }
    }
    return out
}

async function resolveGranteeId(args: Record<string, string | boolean>): Promise<string> {
    if (typeof args['grantee-id'] === 'string') return args['grantee-id']
    const email = args['grantee-email']
    if (typeof email !== 'string') {
        throw new Error('--grantee-email 또는 --grantee-id 가 필요합니다.')
    }
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (!user) throw new Error(`grantee 이메일에 해당하는 사용자가 없습니다: ${email} (최소 1회 로그인 필요)`)
    return user.id
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.list) {
        const grants = await prisma.portfolioAccess.findMany({
            include: {
                owner: { select: { email: true, name: true } },
                grantee: { select: { email: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
        })
        if (grants.length === 0) {
            console.log('(등록된 위임 grant 가 없습니다)')
        } else {
            console.log(`총 ${grants.length}건:`)
            for (const g of grants) {
                console.log(`- [${g.role}] owner=${g.owner.email}(${g.ownerId}) → grantee=${g.grantee.email}(${g.granteeId})`)
            }
        }
        return
    }

    const ownerId = args['owner-id']
    if (typeof ownerId !== 'string') throw new Error('--owner-id 가 필요합니다.')

    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true } })
    if (!owner) throw new Error(`owner id 에 해당하는 사용자가 없습니다: ${ownerId}`)

    const granteeId = await resolveGranteeId(args)
    if (granteeId === ownerId) throw new Error('owner 와 grantee 가 동일합니다. 자기 자신에게는 위임할 수 없습니다.')

    if (args.revoke) {
        const deleted = await prisma.portfolioAccess.deleteMany({ where: { ownerId, granteeId } })
        console.log(deleted.count > 0
            ? `철회 완료: owner=${ownerId} → grantee=${granteeId}`
            : '철회할 grant 가 없습니다.')
        return
    }

    const role = typeof args.role === 'string' ? args.role : 'editor'
    const grant = await prisma.portfolioAccess.upsert({
        where: { ownerId_granteeId: { ownerId, granteeId } },
        update: { role },
        create: { ownerId, granteeId, role },
    })

    console.log('위임 grant 생성/갱신 완료:')
    console.log(`  id       = ${grant.id}`)
    console.log(`  owner    = ${owner.email} (${ownerId})`)
    console.log(`  grantee  = ${granteeId}`)
    console.log(`  role     = ${grant.role}`)
}

main()
    .catch((e) => {
        console.error('실패:', e instanceof Error ? e.message : e)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
