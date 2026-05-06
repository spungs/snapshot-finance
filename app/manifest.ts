import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Snapshot Finance',
        short_name: 'Snapshot',
        description: '주식 포트폴리오 스냅샷 및 시뮬레이션',
        // 로그인 사용자가 PWA 열면 redirect 없이 직행. 비로그인은 middleware 가
        // /auth/signin 으로 안내. / → /dashboard 라운드트립 1회 절약.
        start_url: '/dashboard',
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
