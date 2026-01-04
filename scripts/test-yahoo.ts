
import yahooFinance from 'yahoo-finance2';

async function testSearch(query: string) {
    console.log(`Searching for: ${query}`);
    try {
        // Use default singleton
        const results: any = await yahooFinance.search(query);
        console.log('Results:');
        if (results.quotes) {
            results.quotes.forEach((quote: any) => {
                console.log(`Symbol: ${quote.symbol}, Type: ${quote.quoteType}, Name: ${quote.shortname || quote.longname}`);
            });
        } else {
            console.log('No quotes found in results');
            console.log(JSON.stringify(results, null, 2));
        }
    } catch (error) {
        console.error('Search failed:', error);
    }
}

testSearch('AAPL');
