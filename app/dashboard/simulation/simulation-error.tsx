'use client'

import { useLanguage } from '@/lib/i18n/context'

export default function SimulationError() {
    const { t } = useLanguage()
    return <div>{t('accountNotFound')}</div>
}
