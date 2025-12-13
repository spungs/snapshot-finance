import type { Config } from "@netlify/functions";

export default async (req: Request) => {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);

    try {
        const siteUrl = process.env.URL || 'http://localhost:3000';
        const response = await fetch(`${siteUrl}/api/cron/delete-expired-users`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
        });

        console.log(`Delete expired users trigger status: ${response.status}`);
    } catch (error) {
        console.error("Failed to trigger delete expired users:", error);
    }
};

export const config: Config = {
    schedule: "0 0 * * *"
};
