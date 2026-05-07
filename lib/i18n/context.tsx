'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Language, translations, TranslationKey } from './translations'

interface LanguageContextType {
    language: Language
    setLanguage: (lang: Language) => void
    t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('ko') // Default to ko

    useEffect(() => {
        // Check local storage
        const savedLang = localStorage.getItem('language') as Language
        if (savedLang) {
            setLanguageState(savedLang)
        } else {
            // Check browser language
            const browserLang = navigator.language.startsWith('ko') ? 'ko' : 'en'
            setLanguageState(browserLang)
        }
    }, [])

    const setLanguage = (lang: Language) => {
        setLanguageState(lang)
        localStorage.setItem('language', lang)
    }

    const t = (key: TranslationKey) => {
        const value = translations[language][key]
        // 키를 TranslationKey 로 좁혔으므로 value 는 string 이지만, translations[language] 는 ko/en 유니온이라 narrowing 한계 → 명시 캐스팅
        return (value as string) || (key as string)
    }

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export function useLanguage() {
    const context = useContext(LanguageContext)
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider')
    }
    return context
}
