/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://snapshot-finance.vercel.app',
    generateRobotsTxt: true,
    // optional
    robotsTxtOptions: {
        additionalSitemaps: [
            'https://snapshot-finance.vercel.app/sitemap.xml',
        ],
    },
}
