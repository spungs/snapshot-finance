/**
 * Circuit Breaker pattern for Yahoo Finance API
 * Prevents excessive requests when rate limit is hit
 */
class YahooCircuitBreaker {
    private failureCount = 0
    private lastFailureTime = 0
    private readonly FAILURE_THRESHOLD = 3 // Open circuit after 3 failures
    private readonly COOLDOWN_MS = 60000 // 1 minute cooldown

    /**
     * Check if requests are allowed
     * @returns true if circuit is closed (requests allowed), false if open (blocked)
     */
    canRequest(): boolean {
        if (this.failureCount >= this.FAILURE_THRESHOLD) {
            const elapsed = Date.now() - this.lastFailureTime
            if (elapsed < this.COOLDOWN_MS) {
                console.log(`[Circuit Breaker] Circuit is OPEN. Blocking request. Cooldown remaining: ${Math.ceil((this.COOLDOWN_MS - elapsed) / 1000)}s`)
                return false // Circuit open - block requests
            }
            // Cooldown period has passed, reset and allow
            console.log('[Circuit Breaker] Cooldown complete. Resetting circuit.')
            this.reset()
        }
        return true // Circuit closed - allow requests
    }

    /**
     * Record a failure (e.g., 429 error)
     */
    recordFailure() {
        this.failureCount++
        this.lastFailureTime = Date.now()
        console.log(`[Circuit Breaker] Failure recorded. Count: ${this.failureCount}/${this.FAILURE_THRESHOLD}`)

        if (this.failureCount >= this.FAILURE_THRESHOLD) {
            console.log('[Circuit Breaker] Circuit is now OPEN. Blocking requests for 1 minute.')
        }
    }

    /**
     * Record a successful request
     */
    recordSuccess() {
        if (this.failureCount > 0) {
            console.log('[Circuit Breaker] Request succeeded. Resetting failure count.')
            this.reset()
        }
    }

    /**
     * Reset the circuit breaker
     */
    private reset() {
        this.failureCount = 0
    }

    /**
     * Get current status for debugging
     */
    getStatus() {
        return {
            isOpen: this.failureCount >= this.FAILURE_THRESHOLD,
            failureCount: this.failureCount,
            threshold: this.FAILURE_THRESHOLD,
        }
    }
}

// Singleton instance
export const yahooCircuitBreaker = new YahooCircuitBreaker()
