/**
 * Mock authentication helper
 * Returns a hardcoded user for development
 */
export async function auth() {
    // In production, this would verify session/token and return real user
    // For now, return the demo user
    return {
        id: 'test-user-free',
        email: 'test@example.com',
        name: 'Test User',
    }
}
