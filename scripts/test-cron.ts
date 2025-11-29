import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Verifying Cron Job...')

    // 1. Setup Pro User with Auto-Snapshot Enabled
    const userEmail = 'pro@example.com'
    const user = await prisma.user.findUnique({
        where: { email: userEmail },
        include: { accounts: true },
    })

    if (!user) {
        console.error('Pro user not found. Run seed first.')
        return
    }

    const account = user.accounts[0]
    if (!account) {
        console.error('Account not found for Pro user.')
        return
    }

    // Enable auto-snapshot
    await prisma.securitiesAccount.update({
        where: { id: account.id },
        data: { isAutoSnapshotEnabled: true },
    })
    console.log(`Enabled auto-snapshot for account: ${account.id}`)

    // 2. Create an initial snapshot (yesterday)
    // We need a previous snapshot to copy from.
    // Delete existing snapshots first to be clean.
    await prisma.portfolioSnapshot.deleteMany({
        where: { accountId: account.id },
    })

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    await prisma.portfolioSnapshot.create({
        data: {
            accountId: account.id,
            snapshotDate: yesterday,
            totalValue: 5000000,
            totalCost: 4000000,
            totalProfit: 1000000,
            profitRate: 25.0,
            cashBalance: 0,
            note: 'Yesterday Snapshot',
            holdings: {
                create: [
                    {
                        stockId: (await prisma.stock.findFirst())?.id!,
                        quantity: 10,
                        averagePrice: 50000,
                        currentPrice: 60000,
                        totalCost: 500000,
                        currentValue: 600000,
                        profit: 100000,
                        profitRate: 20.0,
                    }
                ]
            }
        }
    })
    console.log('Created initial snapshot (yesterday).')

    // 3. Call Cron API
    console.log('Calling Cron API...')
    try {
        const response = await fetch('http://localhost:3000/api/cron/daily-snapshot', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer test_secret_12345'
            }
        })

        const result = await response.json()
        console.log('Cron Response:', result)

        if (response.ok && result.success) {
            console.log('✅ Cron job executed successfully.')
        } else {
            console.error('❌ Cron job failed.')
        }

    } catch (error) {
        console.error('Error calling Cron API:', error)
    }

    // 4. Verify new snapshot created
    const snapshots = await prisma.portfolioSnapshot.findMany({
        where: { accountId: account.id },
        orderBy: { snapshotDate: 'desc' },
    })

    console.log(`Total snapshots: ${snapshots.length}`)
    if (snapshots.length === 2) {
        const latest = snapshots[0]
        const isToday = new Date(latest.snapshotDate).getDate() === new Date().getDate()
        if (isToday && latest.note === 'Auto-generated via Cron') {
            console.log('✅ SUCCESS: New snapshot created for today.')
        } else {
            console.error('❌ FAILURE: Latest snapshot is not from today or not auto-generated.')
        }
    } else {
        console.error('❌ FAILURE: Expected 2 snapshots, found ' + snapshots.length)
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect())
