const axios = require('axios');
const popularStocks = require('../data/popularStocks');

class StockDataService {
  constructor() {
    // Using Alpha Vantage API (free tier)
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    this.baseUrl = 'https://www.alphavantage.co/query';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  // Get cache key for API requests
  getCacheKey(symbol, functionType) {
    return `${symbol}_${functionType}`;
  }

  // Check if cached data is still valid
  isCacheValid(cachedData) {
    return cachedData && (Date.now() - cachedData.timestamp) < this.cacheTimeout;
  }

  // Get cached data or return null
  getCachedData(symbol, functionType) {
    const key = this.getCacheKey(symbol, functionType);
    const cached = this.cache.get(key);
    return this.isCacheValid(cached) ? cached.data : null;
  }

  // Set cache data
  setCachedData(symbol, functionType, data) {
    const key = this.getCacheKey(symbol, functionType);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Search for stocks by symbol or name
  async searchStocks(keywords) {
    try {
      const cachedData = this.getCachedData(keywords, 'search');
      if (cachedData) {
        return cachedData;
      }

      let apiResults = [];
      
      // Try Alpha Vantage API first (if not using demo key)
      if (this.apiKey !== 'demo' && this.apiKey) {
        try {
          const response = await axios.get(this.baseUrl, {
            params: {
              function: 'SYMBOL_SEARCH',
              keywords,
              apikey: this.apiKey
            }
          });

          const data = response.data;
          if (!data['Error Message'] && data.bestMatches) {
            apiResults = data.bestMatches.map(match => ({
              symbol: match['1. symbol'],
              name: match['2. name'],
              type: match['3. type'],
              region: match['4. region'],
              currency: match['8. currency']
            }));
          }
        } catch (apiError) {
          console.warn('Alpha Vantage API search failed, using fallback:', apiError.message);
        }
      }

      // Fallback to local database if API fails or returns no results
      if (apiResults.length === 0) {
        const searchTerm = keywords.toLowerCase().trim();
        
        // Search in popular stocks database
        const fallbackResults = popularStocks.filter(stock => {
          return stock.symbol.toLowerCase().includes(searchTerm) ||
                 stock.name.toLowerCase().includes(searchTerm);
        }).slice(0, 10); // Limit to 10 results

        apiResults = fallbackResults;
      }

      // If still no results, return some popular suggestions
      if (apiResults.length === 0) {
        apiResults = popularStocks.slice(0, 10);
      }

      this.setCachedData(keywords, 'search', apiResults);
      return apiResults;
    } catch (error) {
      console.error('Error searching stocks:', error.message);
      
      // Always return fallback results on error
      return popularStocks.slice(0, 10);
    }
  }

  // Get real-time quote for a stock
  async getQuote(symbol) {
    try {
      const cachedData = this.getCachedData(symbol, 'quote');
      if (cachedData) {
        return cachedData;
      }

      let quote = null;
      
      // Try Alpha Vantage API first (if not using demo key)
      if (this.apiKey !== 'demo' && this.apiKey) {
        try {
          const response = await axios.get(this.baseUrl, {
            params: {
              function: 'GLOBAL_QUOTE',
              symbol,
              apikey: this.apiKey
            }
          });

          const data = response.data;
          if (!data['Error Message'] && data['Global Quote']) {
            const quoteData = data['Global Quote'];
            quote = {
              symbol: quoteData['01. symbol'],
              price: parseFloat(quoteData['05. price']),
              change: parseFloat(quoteData['09. change']),
              changePercent: parseFloat(quoteData['10. change percent'].replace('%', '')),
              open: parseFloat(quoteData['02. open']),
              high: parseFloat(quoteData['03. high']),
              low: parseFloat(quoteData['04. low']),
              volume: parseInt(quoteData['06. volume']),
              previousClose: parseFloat(quoteData['08. previous close']),
              lastUpdated: quoteData['07. latest trading day']
            };
          }
        } catch (apiError) {
          console.warn('Alpha Vantage API quote failed, using fallback:', apiError.message);
        }
      }

      // Fallback to mock data for popular stocks
      if (!quote) {
        const stock = popularStocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
        if (stock) {
          // Generate realistic mock data
          const basePrice = this.getMockPrice(symbol);
          const change = (Math.random() - 0.5) * 10; // Random change between -5 and +5
          const changePercent = (change / basePrice) * 100;
          
          quote = {
            symbol: stock.symbol,
            price: basePrice + change,
            change: change,
            changePercent: changePercent,
            open: basePrice,
            high: basePrice + Math.abs(change) + Math.random() * 5,
            low: basePrice - Math.abs(change) - Math.random() * 5,
            volume: Math.floor(Math.random() * 10000000) + 1000000,
            previousClose: basePrice,
            lastUpdated: new Date().toISOString().split('T')[0],
            currency: stock.currency
          };
        }
      }

      if (!quote) {
        throw new Error(`No data found for symbol ${symbol}`);
      }

      this.setCachedData(symbol, 'quote', quote);
      return quote;
    } catch (error) {
      console.error(`Error getting quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  // Helper function to generate mock prices for popular stocks
  getMockPrice(symbol) {
    const mockPrices = {
      'AAPL': 150, 'MSFT': 350, 'GOOGL': 140, 'AMZN': 130, 'META': 300,
      'TSLA': 200, 'NVDA': 450, 'NFLX': 400, 'ADBE': 500, 'CRM': 250,
      'JPM': 140, 'BAC': 30, 'WFC': 40, 'GS': 350, 'V': 250,
      'JNJ': 160, 'UNH': 480, 'PFE': 30, 'WMT': 160, 'HD': 300,
      'XOM': 100, 'CVX': 140, 'BA': 200, 'CAT': 250, 'GE': 120,
      'RELIANCE': 2500, 'TCS': 3500, 'HDFCBANK': 1500, 'INFY': 1800,
      'ASML': 600, 'SAP': 140, 'NESN': 80, 'BP': 500, 'HSBA': 600
    };
    
    return mockPrices[symbol.toUpperCase()] || 100 + Math.random() * 400;
  }

  // Get historical data for charts
  async getHistoricalData(symbol, timeRange = 'daily') {
    try {
      const cachedData = this.getCachedData(symbol, `historical_${timeRange}`);
      if (cachedData) {
        return cachedData;
      }

      let functionType = 'TIME_SERIES_DAILY';
      if (timeRange === 'weekly') functionType = 'TIME_SERIES_WEEKLY';
      if (timeRange === 'monthly') functionType = 'TIME_SERIES_MONTHLY';

      const response = await axios.get(this.baseUrl, {
        params: {
          function: functionType,
          symbol,
          apikey: this.apiKey
        }
      });

      const data = response.data;
      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
      const timeSeries = data[timeSeriesKey] || {};

      const formattedData = Object.entries(timeSeries).map(([date, values]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      })).reverse(); // Reverse to get chronological order

      this.setCachedData(symbol, `historical_${timeRange}`, formattedData);
      return formattedData;
    } catch (error) {
      console.error(`Error getting historical data for ${symbol}:`, error.message);
      throw error;
    }
  }

  // Get company overview
  async getCompanyOverview(symbol) {
    try {
      const cachedData = this.getCachedData(symbol, 'overview');
      if (cachedData) {
        return cachedData;
      }

      const response = await axios.get(this.baseUrl, {
        params: {
          function: 'OVERVIEW',
          symbol,
          apikey: this.apiKey
        }
      });

      const data = response.data;
      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      if (!data.Symbol) {
        throw new Error('No data found for symbol');
      }

      const overview = {
        symbol: data.Symbol,
        name: data.Name,
        description: data.Description,
        sector: data.Sector,
        industry: data.Industry,
        marketCap: parseInt(data.MarketCapitalization),
        peRatio: parseFloat(data.PERatio),
        dividendYield: parseFloat(data.DividendYield),
        fiftyTwoWeekHigh: parseFloat(data['52WeekHigh']),
        fiftyTwoWeekLow: parseFloat(data['52WeekLow']),
        beta: parseFloat(data.Beta),
        eps: parseFloat(data.EPS),
        bookValue: parseFloat(data.BookValue),
        priceToBook: parseFloat(data.PriceToBookRatio)
      };

      this.setCachedData(symbol, 'overview', overview);
      return overview;
    } catch (error) {
      console.error(`Error getting company overview for ${symbol}:`, error.message);
      throw error;
    }
  }

  // Batch update prices for multiple symbols
  async updateMultiplePrices(symbols) {
    const results = [];
    const batchSize = 5; // Alpha Vantage has rate limits

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchPromises = batch.map(async (symbol) => {
        try {
          const quote = await this.getQuote(symbol);
          return { symbol, success: true, data: quote };
        } catch (error) {
          console.error(`Failed to update ${symbol}:`, error.message);
          return { symbol, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

module.exports = new StockDataService();
