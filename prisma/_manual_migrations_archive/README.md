# 수동 마이그레이션 아카이브

이 폴더는 **Prisma 마이그레이션 디렉토리(`prisma/migrations/`) 밖**에 의도적으로 보관됩니다.
여기 있는 SQL은 운영 DB에 **수동으로 이미 적용**된 것으로, Prisma가 마이그레이션으로 인식하면 안 됩니다.

> 과거 `prisma/migrations/manual/unify-stocks.sql` 위치에 있을 때 Prisma가 이를
> `migration.sql` 없는 깨진 마이그레이션("manual")으로 인식해 `migrate status`가
> "not yet applied"를 띄우고, `migrate dev` 시 drift/reset 위험을 만들었습니다.
> 이 폴더로 옮긴 뒤 운영 `migrate status` = **"up to date"** 로 정합됩니다.

## unify-stocks.sql

`stocks`(cuid PK) → `kis_stock_masters`를 `stocks`(stockCode PK)로 통합하고
`holdings`/`snapshot_holdings`의 FK를 `stockId` → `stockCode`로 재배선한 일회성 작업.
**운영 DB·기존 로컬 DB에는 적용 완료.** 기존 `stocks`는 `stocks_legacy`로 백업됨.

### 새 환경(빈 DB)을 셋업할 때
1. `prisma migrate deploy` 로 정식 마이그레이션 15개 적용 (이 시점 스키마는 옛 `stockId` 구조)
2. 이어서 이 `unify-stocks.sql` 을 수동 적용해 `stockCode` 구조로 전환
   ```bash
   psql "$DIRECT_URL" -f prisma/_manual_migrations_archive/unify-stocks.sql
   ```
3. (선택) 7일 백업 테이블 정리: `DROP TABLE IF EXISTS stocks_legacy CASCADE;`

> 새 환경에서도 history만으로 자동 재현되길 원하면, unify를 정식 마이그레이션으로
> 편입하고 운영 DB에 `prisma migrate resolve --applied <name>` 으로 마킹해야 합니다
> (스키마 무변경, `_prisma_migrations`에 기록만 추가). 현재는 운영 안전성 우선으로 보류.
