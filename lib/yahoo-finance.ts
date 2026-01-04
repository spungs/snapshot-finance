import YahooFinance from 'yahoo-finance2';

// Create a singleton instance to share cookies/session and prevent rate limiting
// caused by creating frequent new instances.
const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
});

export default yahooFinance;
