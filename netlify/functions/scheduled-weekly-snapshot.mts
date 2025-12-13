import type { Config } from "@netlify/functions";

export default async (req: Request) => {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);

    try {
        const siteUrl = process.env.URL || 'http://localhost:3000';
        // Using the secret if you have one, otherwise just calling the public endpoint if it is open
        // Ideally we should move logic here or secure the endpoint. 
        // For migration parity, we call the existing API route.
        const response = await fetch(`${siteUrl}/api/cron/weekly-snapshot`, {
            method: "GET",
            // Optional: Add a shared secret header if your API route verifies it
            // headers: { "Authorization": `Bearer ${process.env.CRON_SECRET}` } 
        });

        console.log(`Weekly snapshot trigger status: ${response.status}`);
    } catch (error) {
        console.error("Failed to trigger weekly snapshot:", error);
    }
};

export const config: Config = {
    // 00:00 UTC Sun
    schedule: "0 0 * * 6"
};
