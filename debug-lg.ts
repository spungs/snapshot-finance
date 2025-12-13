
import { prisma } from './lib/prisma'

async function main() {
    console.log('Searching for LG Display...')

    // Check exact name in Stock
    const stock = await prisma.stock.findFirst({
        where: { stockName: 'LG디스플레이' }
    })
    console.log('Stock (Exact Name):', stock)

    // Check exact name in Master
    const master = await prisma.kisStockMaster.findFirst({
        where: { stockName: 'LG디스플레이' }
    })
    console.log('Master (Exact Name):', master)

    // Check contains in Master
    const masterContains = await prisma.kisStockMaster.findMany({
        where: { stockName: { contains: 'LG디스플레이' } },
        take: 5
    })
    console.log('Master (Contains):', masterContains)
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
