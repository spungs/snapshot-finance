
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" },
    ...authConfig,
    providers: [
        ...authConfig.providers,
    ],
    callbacks: {
        ...authConfig.callbacks,
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub

                // Check if user is soft-deleted
                const user = await prisma.user.findUnique({
                    where: { id: token.sub },
                    select: { deletedAt: true }
                })

                if (user?.deletedAt) {
                    // Restore account on login
                    await prisma.user.update({
                        where: { id: token.sub },
                        data: { deletedAt: null }
                    })
                }
            }
            return session
        },
    },
})
