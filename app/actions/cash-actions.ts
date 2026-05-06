'use server'

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { holdingService } from "@/lib/services/holding-service"
import { validateCashAmount } from "@/lib/validation/portfolio-input"

export async function updateCashBalance(amount: number) {
    const session = await auth()

    if (!session?.user?.id) {
        return { success: false, error: "Unauthorized" }
    }

    const validated = validateCashAmount(amount)
    if (!validated.ok) {
        return { success: false, error: validated.error }
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { cashBalance: validated.value }
        })

        await holdingService.invalidate(session.user.id)
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash balance:", error)
        return { success: false, error: "Failed to update cash balance" }
    }
}
