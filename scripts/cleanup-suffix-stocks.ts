import { prisma } from '@/lib/prisma'

async function main() {
    const suffixed = await prisma.stock.findMany({
        where: {
            OR: [
                { stockCode: { endsWith: '.KS' } },
                { stockCode: { endsWith: '.KQ' } },
            ],
        },
        include: { _count: { select: { liveHoldings: true, holdings: true } } },
    })

    console.log(`[before] suffixed Stock records: ${suffixed.length}`)

    const toDelete: { id: string; code: string }[] = []
    const toRename: { id: string; from: string; to: string }[] = []
    const conflicts: { id: string; code: string; reason: string }[] = []

    for (const s of suffixed) {
        const cleanCode = s.stockCode.replace(/\.(KS|KQ)$/, '')
        const usage = s._count.liveHoldings + s._count.holdings
        const counterpart = await prisma.stock.findUnique({ where: { stockCode: cleanCode } })

        if (counterpart) {
            if (usage === 0) {
                toDelete.push({ id: s.id, code: s.stockCode })
            } else {
                conflicts.push({
                    id: s.id,
                    code: s.stockCode,
                    reason: `clean counterpart exists AND ${usage} usages — manual merge required`,
                })
            }
        } else {
            toRename.push({ id: s.id, from: s.stockCode, to: cleanCode })
        }
    }

    console.log(`  to delete (dead, has clean counterpart): ${toDelete.length}`)
    toDelete.forEach(r => console.log(`    - ${r.code}`))
    console.log(`  to rename (strip suffix in place): ${toRename.length}`)
    toRename.forEach(r => console.log(`    - ${r.from} -> ${r.to}`))
    if (conflicts.length) {
        console.log(`  conflicts (skipped): ${conflicts.length}`)
        conflicts.forEach(r => console.log(`    - ${r.code}: ${r.reason}`))
    }

    await prisma.$transaction(async (tx) => {
        for (const r of toDelete) {
            await tx.stock.delete({ where: { id: r.id } })
        }
        for (const r of toRename) {
            await tx.stock.update({ where: { id: r.id }, data: { stockCode: r.to } })
        }
    })

    const remaining = await prisma.stock.count({
        where: {
            OR: [
                { stockCode: { endsWith: '.KS' } },
                { stockCode: { endsWith: '.KQ' } },
            ],
        },
    })
    console.log(`[after] suffixed Stock records remaining: ${remaining}`)

    await prisma.$disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
