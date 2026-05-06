import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Snapshot Finance',
        short_name: 'Snapshot',
        description: '주식 포트폴리오 스냅샷 및 시뮬레이션',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a7c4a',
        icons: [
            {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
