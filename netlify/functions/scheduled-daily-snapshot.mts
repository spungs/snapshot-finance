import type { Config } from "@netlify/functions";

export default async (req: Request) => {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);

    try {
        const siteUrl = process.env.URL || 'http://localhost:3000';
        const response = await fetch(`${siteUrl}/api/cron/daily-snapshot`, {
            method: "GET",
        });

        console.log(`Daily snapshot trigger status: ${response.status}`);
    } catch (error) {
        console.error("Failed to trigger daily snapshot:", error);
    }
};

export const config: Config = {
    // 21:30 UTC Mon-Fri = 06:30 KST Tue-Sat
    schedule: "30 21 * * 1-5"
};
