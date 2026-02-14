const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
require('dotenv').config();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const app = express();
const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-tracker')
  .then(() => console.log('MongoDB Connected -', process.env.NODE_ENV === 'production' ? 'Production' : 'Development'))
  .catch(err => console.error('MongoDB connection error:', err));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL] 
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const transactionSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  tags: [String],
  fingerprint: { type: String, unique: true, required: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema);

app.get('/api/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, category } = req.query;
    const filter = { isDeleted: false };
    
    if (type) filter.type = type;
    if (category) filter.category = category;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const transactions = await Transaction.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Transaction.countDocuments(filter);

    res.json({
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = new Transaction(req.body);
    await transaction.save();
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const result = await Transaction.findByIdAndUpdate(
      req.params.id, 
      { isDeleted: true }, 
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { date, amount, type, category, description } = req.body;
    
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { 
        date: new Date(date),
        amount: parseFloat(amount),
        type,
        category,
        description
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.get('/api/transactions/summary', async (req, res) => {
  try {
    const summary = await Transaction.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    let totalIncome = 0;
    let totalExpenses = 0;

    summary.forEach(item => {
      if (item._id === 'income') totalIncome = item.total;
      if (item._id === 'expense') totalExpenses = item.total;
    });

    res.json({
      totalIncome,
      totalExpenses,
      netFlow: totalIncome - totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// CSV Preview Endpoint
app.post('/api/csv/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const headers = [];
    let headerCaptured = false;
    let rowCount = 0;

    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          if (!headerCaptured) {
            headers.push(...Object.keys(data));
            headerCaptured = true;
          }
          
          if (rowCount < 20) { // Only first 20 rows for preview
            results.push(data);
            rowCount++;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    res.json({
      headers,
      data: results,
      totalRows: rowCount
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    res.status(500).json({ error: 'Failed to parse CSV file' });
  }
});

// CSV Import with Column Mapping
app.post('/api/csv/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { columnMapping } = req.body;
    
    if (!columnMapping) {
      return res.status(400).json({ error: 'Column mapping is required' });
    }

    const mapping = JSON.parse(columnMapping);
    const results = [];
    const errors = [];
    let processedRows = 0;
    let skippedRows = 0;

    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          try {
            processedRows++;
            
            // Map CSV columns to transaction fields
            const transaction = {
              date: new Date(data[mapping.date] || ''),
              amount: parseFloat(data[mapping.amount] || '0'),
              type: data[mapping.type] || 'expense',
              category: data[mapping.category] || 'Uncategorized',
              description: data[mapping.description] || '',
              tags: []
            };

            // Validate required fields
            if (!transaction.date || isNaN(transaction.date.getTime())) {
              errors.push({ row: processedRows, error: 'Invalid date format' });
              skippedRows++;
              return;
            }

            if (isNaN(transaction.amount) || transaction.amount <= 0) {
              errors.push({ row: processedRows, error: 'Invalid amount' });
              skippedRows++;
              return;
            }

            if (!['income', 'expense'].includes(transaction.type)) {
              transaction.type = 'expense'; // Default to expense
            }

            // Generate unique fingerprint for deduplication
            const fingerprint = `${transaction.date.toISOString()}-${transaction.amount}-${transaction.type}-${transaction.description}-${transaction.category}`;
            transaction.fingerprint = fingerprint;

            results.push(transaction);
          } catch (error) {
            errors.push({ row: processedRows, error: error.message });
            skippedRows++;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Insert valid transactions into database
    let insertedCount = 0;
    if (results.length > 0) {
      const inserted = await Transaction.insertMany(results);
      insertedCount = inserted.length;
    }

    res.json({
      success: true,
      summary: {
        totalRows: processedRows,
        insertedRows: insertedCount,
        skippedRows,
        errors: errors.length
      },
      errors: errors.slice(0, 10) // Return first 10 errors for display
    });
  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV file' });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
