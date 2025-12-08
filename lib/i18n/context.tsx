'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Language, translations } from './translations'

interface LanguageContextType {
    language: Language
    setLanguage: (lang: Language) => void
    t: (key: keyof typeof translations['ko']) => string
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

    const t = (key: keyof typeof translations['ko']) => {
        const value = translations[language][key]
        return value !== undefined ? value : key
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
