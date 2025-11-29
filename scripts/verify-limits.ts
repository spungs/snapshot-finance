import { PrismaClient } from '@prisma/client'
import { SUBSCRIPTION_LIMITS } from '../lib/config/subscription'

const prisma = new PrismaClient()

async function main() {
    console.log('Verifying snapshot limits...')

    // 1. Get Free User and Account
    const user = await prisma.user.findUnique({
        where: { email: 'free@example.com' },
        include: { accounts: true },
    })

    if (!user || user.accounts.length === 0) {
        console.error('Free user or account not found. Run seed first.')
        return
    }

    const accountId = user.accounts[0].id
    const limit = SUBSCRIPTION_LIMITS.FREE

    console.log(`User: ${user.email}, Plan: ${user.plan}, Limit: ${limit}`)

    // 1.5 Get a valid stock
    const stock = await prisma.stock.findFirst()
    if (!stock) {
        console.error('No stocks found. Run seed first.')
        return
    }


    // 2. Clean up existing snapshots for this account
    await prisma.portfolioSnapshot.deleteMany({
        where: { accountId },
    })
    console.log('Cleaned up existing snapshots.')

    // 3. Create (limit) snapshots directly in DB
    console.log(`Creating ${limit} dummy snapshots...`)
    const data = Array.from({ length: limit }).map((_, i) => ({
        accountId,
        totalValue: 1000000,
        totalCost: 900000,
        totalProfit: 100000,
        profitRate: 11.11,
        cashBalance: 0,
        note: `Dummy snapshot ${i + 1}`,
    }))

    await prisma.portfolioSnapshot.createMany({
        data,
    })

    // 4. Verify count
    const count = await prisma.portfolioSnapshot.count({
        where: { accountId },
    })
    console.log(`Current snapshot count: ${count}`)

    if (count !== limit) {
        console.error('Failed to create dummy snapshots.')
        return
    }

    // 5. Try to create one more via API (Simulated)
    // Since we can't easily call the Next.js API route from here without running the server,
    // we will simulate the logic check or just run a curl command if the server was running.
    // But here, let's just verify the logic by calling the DB check again?
    // No, we want to test the API code.

    // Alternative: We can use `node-fetch` to hit the running dev server.
    // Assuming dev server is running on localhost:3000.

    console.log('To verify the API, please ensure "npm run dev" is running.')
    console.log('Attempting to create 31st snapshot via API...')

    try {
        const response = await fetch('http://localhost:3000/api/snapshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId,
                holdings: [
                    {
                        stockId: stock.id,
                        quantity: 1,
                        averagePrice: 10000,
                        currentPrice: 11000,
                    }
                ],
                cashBalance: 0,
                note: 'This should fail',
            }),
        })

        const result = await response.json()
        console.log('API Response Status:', response.status)
        console.log('API Response Body:', result)

        if (response.status === 403 && result.error.code === 'SNAPSHOT_LIMIT_EXCEEDED') {
            console.log('✅ SUCCESS: Snapshot creation blocked as expected.')
        } else {
            console.error('❌ FAILURE: Snapshot creation was not blocked or returned unexpected error.')
        }
    } catch (error) {
        console.error('Error calling API. Is the server running?', error)
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect())
