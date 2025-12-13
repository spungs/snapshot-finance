
import 'dotenv/config'
import { kisClient } from '../lib/api/kis-client'

async function main() {
    try {
        console.log("Fetching price for 475400 (KOSDAQ)...")
        const price = await kisClient.getCurrentPrice('475400', 'KOSDAQ')
        console.log("Price result:", price)
    } catch (e) {
        console.error("Error fetching price:", e)
    }
}

main()
