This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 배포 (Deployment)

### Netlify 배포 (권장)

이 프로젝트는 현재 Netlify 배포를 위해 구성되어 있습니다.

1.  GitHub 저장소를 Netlify에 연결합니다.
2.  **Build Command:** `npm run build`
3.  **Publish Directory:** `.next`
4.  **Environment Variables:** `.env` 파일의 내용(DATABASE_URL, NEXTAUTH_SECRET 등)을 Netlify Site Settings > Environment Variables에 모두 추가합니다.
5.  **Cron Jobs:** `netlify/functions`에 정의된 스케줄 함수들이 자동으로 감지되어 매일/매주 스냅샷 작업을 수행합니다.

### Vercel 배포 (참고)

Vercel 배포 시 `vercel.json`의 설정을 따릅니다.
