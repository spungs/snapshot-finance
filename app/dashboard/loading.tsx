import { HomeSkeleton } from './home-skeleton'

// 라우트 전환 fallback 과 page.tsx 의 Suspense fallback 을 동일 컴포넌트로
// 통일해 1단계→2단계 깜빡임을 제거한다. 자식 라우트가 자체 loading.tsx 를
// 가지면 해당 라우트에서는 이 파일이 표시되지 않는다.
export default function DashboardLoading() {
    return <HomeSkeleton />
}
