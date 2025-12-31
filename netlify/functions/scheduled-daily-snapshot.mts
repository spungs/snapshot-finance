// import type { Config } from "@netlify/functions";
//
// export default async (req: Request) => {
//     const { next_run } = await req.json();
//     console.log("Received event! Next invocation at:", next_run);
//
//     try {
//         const siteUrl = process.env.URL || 'http://localhost:3000';
//         const response = await fetch(`${siteUrl}/api/cron/daily-snapshot`, {
//             method: "GET",
//             headers: {
//                 'Authorization': `Bearer ${process.env.CRON_SECRET}`
//             }
//         });
//
//         console.log(`Daily snapshot trigger status: ${response.status}`);
//     } catch (error) {
//         console.error("Failed to trigger daily snapshot:", error);
//     }
// };
//
// export const config: Config = {
//     // 22:30 UTC
//     // schedule: "30 22 * * *"
// };
