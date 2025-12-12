'use server'

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function updateCashBalance(amount: number) {
    const session = await auth()

    if (!session?.user?.id) {
        throw new Error("Unauthorized")
    }

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { cashBalance: amount }
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error("Failed to update cash balance:", error)
        return { success: false, error: "Failed to update cash balance" }
    }
}
