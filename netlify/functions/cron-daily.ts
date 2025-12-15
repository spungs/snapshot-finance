// import { schedule } from '@netlify/functions'
//
// // Daily Snapshot: Runs at 22:30 UTC Daily (07:30 KST)
// export const handler = schedule('30 22 * * *', async () => {
//     const CRON_SECRET = process.env.CRON_SECRET
//     const SITE_URL = process.env.URL || 'https://snapshot.finance' // Netlify provides URL env
//
//     try {
//         const response = await fetch(`${SITE_URL}/api/cron/daily-snapshot`, {
//             headers: {
//                 Authorization: `Bearer ${CRON_SECRET}`,
//             },
//         })
//
//         if (!response.ok) {
//             console.error(`[Netlify Cron] Daily Snapshot failed with status: ${response.status}`)
//             return { statusCode: response.status }
//         }
//
//         const data = await response.json()
//         console.log('[Netlify Cron] Daily Snapshot success:', data)
//
//         return {
//             statusCode: 200,
//         }
//     } catch (error) {
//         console.error('[Netlify Cron] Error triggering daily snapshot:', error)
//         return { statusCode: 500 }
//     }
// })
