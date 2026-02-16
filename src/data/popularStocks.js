const popularStocks = [
  // Technology
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'ADBE', name: 'Adobe Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'ORCL', name: 'Oracle Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'UBER', name: 'Uber Technologies Inc.', type: 'Equity', region: 'United States', currency: 'USD' },

  // Finance
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'BAC', name: 'Bank of America Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'GS', name: 'The Goldman Sachs Group Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'MS', name: 'Morgan Stanley', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'C', name: 'Citigroup Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'AXP', name: 'American Express Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'BLK', name: 'BlackRock Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'V', name: 'Visa Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'MA', name: 'Mastercard Incorporated', type: 'Equity', region: 'United States', currency: 'USD' },

  // Healthcare
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'ABT', name: 'Abbott Laboratories', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'DHR', name: 'Danaher Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'AMGN', name: 'Amgen Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', type: 'Equity', region: 'United States', currency: 'USD' },

  // Consumer
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'HD', name: 'The Home Depot Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'NKE', name: 'NIKE Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', type: 'Equity', region: 'United States', currency: 'USD' },

  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'CVX', name: 'Chevron Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'COP', name: 'ConocoPhillips', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'EOG', name: 'EOG Resources Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'SLB', name: 'Schlumberger Limited', type: 'Equity', region: 'United States', currency: 'USD' },

  // Industrial
  { symbol: 'BA', name: 'The Boeing Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'GE', name: 'General Electric Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'MMM', name: '3M Company', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'HON', name: 'Honeywell International Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'UPS', name: 'United Parcel Service Inc.', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'RTX', name: 'Raytheon Technologies Corporation', type: 'Equity', region: 'United States', currency: 'USD' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', type: 'Equity', region: 'United States', currency: 'USD' },

  // Indian Stocks (NSE/BSE)
  { symbol: 'RELIANCE', name: 'Reliance Industries Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'INFY', name: 'Infosys Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'SBIN', name: 'State Bank of India', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Limited', type: 'Equity', region: 'India', currency: 'INR' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited', type: 'Equity', region: 'India', currency: 'INR' },

  // European Stocks
  { symbol: 'ASML', name: 'ASML Holding N.V.', type: 'Equity', region: 'Netherlands', currency: 'EUR' },
  { symbol: 'SAP', name: 'SAP SE', type: 'Equity', region: 'Germany', currency: 'EUR' },
  { symbol: 'NESN', name: 'Nestlé S.A.', type: 'Equity', region: 'Switzerland', currency: 'CHF' },
  { symbol: 'ROG', name: 'Roche Holding AG', type: 'Equity', region: 'Switzerland', currency: 'CHF' },
  { symbol: 'NOVN', name: 'Novartis AG', type: 'Equity', region: 'Switzerland', currency: 'CHF' },
  { symbol: 'MC', name: 'LVMH Moët Hennessy Louis Vuitton S.E.', type: 'Equity', region: 'France', currency: 'EUR' },
  { symbol: 'SAN', name: 'Sanofi S.A.', type: 'Equity', region: 'France', currency: 'EUR' },
  { symbol: 'AI', name: 'Air Liquide S.A.', type: 'Equity', region: 'France', currency: 'EUR' },
  { symbol: 'BP', name: 'BP p.l.c.', type: 'Equity', region: 'United Kingdom', currency: 'GBP' },
  { symbol: 'HSBA', name: 'HSBC Holdings plc', type: 'Equity', region: 'United Kingdom', currency: 'GBP' },
  { symbol: 'SHEL', name: 'Shell plc', type: 'Equity', region: 'United Kingdom', currency: 'GBP' },
  { symbol: 'DGE', name: 'Diageo plc', type: 'Equity', region: 'United Kingdom', currency: 'GBP' },
  { symbol: 'AZN', name: 'AstraZeneca plc', type: 'Equity', region: 'United Kingdom', currency: 'GBP' }
];

module.exports = popularStocks;
