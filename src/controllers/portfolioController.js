const Portfolio = require('../models/Portfolio');
const stockDataService = require('../services/stockDataService');

// Get all portfolio holdings for a user
const getPortfolio = async (req, res) => {
  try {
    const holdings = await Portfolio.find({ 
      userId: req.userId, 
      isDeleted: false 
    }).sort({ buyDate: -1 });

    // Calculate portfolio totals
    const portfolioStats = {
      totalInvested: holdings.reduce((sum, holding) => sum + holding.totalInvested, 0),
      currentValue: holdings.reduce((sum, holding) => sum + holding.currentValue, 0),
      totalPnL: 0,
      totalPnLPercentage: 0
    };

    portfolioStats.totalPnL = portfolioStats.currentValue - portfolioStats.totalInvested;
    if (portfolioStats.totalInvested > 0) {
      portfolioStats.totalPnLPercentage = 
        (portfolioStats.totalPnL / portfolioStats.totalInvested) * 100;
    }

    res.json({
      holdings,
      stats: portfolioStats
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
};

// Add new holding to portfolio
const addHolding = async (req, res) => {
  try {
    const { symbol, name, quantity, buyPrice, buyDate, currency, exchange, notes } = req.body;

    // Validate required fields
    if (!symbol || !name || !quantity || !buyPrice || !buyDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: symbol, name, quantity, buyPrice, buyDate' 
      });
    }

    // Check if holding already exists
    const existingHolding = await Portfolio.findOne({ 
      userId: req.userId, 
      symbol: symbol.toUpperCase(),
      isDeleted: false 
    });

    if (existingHolding) {
      return res.status(400).json({ 
        error: `You already have ${symbol} in your portfolio. Edit the existing holding instead.` 
      });
    }

    // Get current price
    let currentPrice = buyPrice;
    try {
      const quote = await stockDataService.getQuote(symbol);
      currentPrice = quote.price;
    } catch (error) {
      console.warn(`Could not fetch current price for ${symbol}, using buy price:`, error.message);
    }

    const holding = new Portfolio({
      userId: req.userId,
      symbol: symbol.toUpperCase(),
      name,
      quantity: parseFloat(quantity),
      buyPrice: parseFloat(buyPrice),
      buyDate: new Date(buyDate),
      currentPrice: parseFloat(currentPrice),
      currency: currency || 'USD',
      exchange: exchange || 'NASDAQ',
      notes: notes || ''
    });

    await holding.save();

    // Emit real-time event
    req.app.emit('portfolio-updated', { 
      userId: req.userId, 
      action: 'add', 
      holding 
    });

    res.status(201).json(holding);
  } catch (error) {
    console.error('Error adding holding:', error);
    res.status(500).json({ error: 'Failed to add holding' });
  }
};

// Update existing holding
const updateHolding = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, quantity, buyPrice, buyDate, currency, exchange, notes } = req.body;

    const holding = await Portfolio.findOne({ 
      _id: id, 
      userId: req.userId, 
      isDeleted: false 
    });

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    // Update fields
    if (name) holding.name = name;
    if (quantity !== undefined) holding.quantity = parseFloat(quantity);
    if (buyPrice !== undefined) holding.buyPrice = parseFloat(buyPrice);
    if (buyDate) holding.buyDate = new Date(buyDate);
    if (currency) holding.currency = currency;
    if (exchange) holding.exchange = exchange;
    if (notes !== undefined) holding.notes = notes;

    await holding.save();

    // Emit real-time event
    req.app.emit('portfolio-updated', { 
      userId: req.userId, 
      action: 'update', 
      holding 
    });

    res.json(holding);
  } catch (error) {
    console.error('Error updating holding:', error);
    res.status(500).json({ error: 'Failed to update holding' });
  }
};

// Delete holding (soft delete)
const deleteHolding = async (req, res) => {
  try {
    const { id } = req.params;

    const holding = await Portfolio.findOne({ 
      _id: id, 
      userId: req.userId, 
      isDeleted: false 
    });

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    holding.isDeleted = true;
    await holding.save();

    // Emit real-time event
    req.app.emit('portfolio-updated', { 
      userId: req.userId, 
      action: 'delete', 
      holding 
    });

    res.json({ success: true, message: 'Holding deleted successfully' });
  } catch (error) {
    console.error('Error deleting holding:', error);
    res.status(500).json({ error: 'Failed to delete holding' });
  }
};

// Update current prices for all holdings
const updatePrices = async (req, res) => {
  try {
    const holdings = await Portfolio.find({ 
      userId: req.userId, 
      isDeleted: false 
    });

    if (holdings.length === 0) {
      return res.json({ message: 'No holdings to update' });
    }

    const symbols = holdings.map(h => h.symbol);
    const results = await stockDataService.updateMultiplePrices(symbols);

    let updatedCount = 0;
    const errors = [];

    for (const result of results) {
      if (result.success) {
        await Portfolio.updateOne(
          { userId: req.userId, symbol: result.symbol },
          { currentPrice: result.data.price }
        );
        updatedCount++;
      } else {
        errors.push(`${result.symbol}: ${result.error}`);
      }
    }

    // Emit real-time event
    req.app.emit('portfolio-updated', { 
      userId: req.userId, 
      action: 'price-update', 
      updatedCount,
      errors 
    });

    res.json({
      message: `Updated prices for ${updatedCount} holdings`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error updating prices:', error);
    res.status(500).json({ error: 'Failed to update prices' });
  }
};

// Search stocks
const searchStocks = async (req, res) => {
  try {
    const { keywords } = req.query;
    
    if (!keywords) {
      return res.status(400).json({ error: 'Keywords parameter is required' });
    }

    const results = await stockDataService.searchStocks(keywords);
    res.json(results);
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
};

// Get stock quote
const getStockQuote = async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }

    const quote = await stockDataService.getQuote(symbol);
    res.json(quote);
  } catch (error) {
    console.error('Error getting stock quote:', error);
    res.status(500).json({ error: 'Failed to get stock quote' });
  }
};

// Get historical data for charts
const getHistoricalData = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeRange = 'daily' } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }

    const data = await stockDataService.getHistoricalData(symbol, timeRange);
    res.json(data);
  } catch (error) {
    console.error('Error getting historical data:', error);
    res.status(500).json({ error: 'Failed to get historical data' });
  }
};

// Get company overview
const getCompanyOverview = async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }

    const overview = await stockDataService.getCompanyOverview(symbol);
    res.json(overview);
  } catch (error) {
    console.error('Error getting company overview:', error);
    res.status(500).json({ error: 'Failed to get company overview' });
  }
};

// Get portfolio analytics
const getPortfolioAnalytics = async (req, res) => {
  try {
    const holdings = await Portfolio.find({ 
      userId: req.userId, 
      isDeleted: false 
    });

    if (holdings.length === 0) {
      return res.json({
        sectorAllocation: [],
        topPerformers: [],
        worstPerformers: [],
        portfolioDistribution: []
      });
    }

    // Calculate performance metrics
    const holdingsWithPerformance = holdings.map(holding => ({
      ...holding.toObject(),
      pnlPercentage: holding.unrealizedPnLPercentage,
      pnlAmount: holding.unrealizedPnL
    }));

    // Sort by performance
    const sortedByPerformance = holdingsWithPerformance.sort((a, b) => 
      b.pnlPercentage - a.pnlPercentage
    );

    const topPerformers = sortedByPerformance.slice(0, 5);
    const worstPerformers = sortedByPerformance.slice(-5).reverse();

    // Portfolio distribution by value
    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const portfolioDistribution = holdings.map(holding => ({
      symbol: holding.symbol,
      name: holding.name,
      value: holding.currentValue,
      percentage: totalValue > 0 ? (holding.currentValue / totalValue) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    res.json({
      topPerformers,
      worstPerformers,
      portfolioDistribution,
      totalHoldings: holdings.length,
      totalValue
    });
  } catch (error) {
    console.error('Error getting portfolio analytics:', error);
    res.status(500).json({ error: 'Failed to get portfolio analytics' });
  }
};

module.exports = {
  getPortfolio,
  addHolding,
  updateHolding,
  deleteHolding,
  updatePrices,
  searchStocks,
  getStockQuote,
  getHistoricalData,
  getCompanyOverview,
  getPortfolioAnalytics
};
