const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-tracker';

const connectWithRetry = async (retries = 5, delayMs = 5000) => {
  try {
    const maskedHost = (MONGODB_URI || '').split('@').pop()?.split('/')[0] || 'localhost';
    console.log('Connecting to Mongo host (masked):', maskedHost);

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000
    });

    console.log('Connected to MongoDB');

    try {
      await mongoose.connection.collection('transactions').dropIndex('fingerprint_1');
      console.log('Fixed: Dropped global fingerprint index');
    } catch (e) {
      // Ignore if index doesn't exist
    }

    // Start server after DB connection
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (env: ${process.env.PORT || 'default'})`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err?.message || err);
    if (retries > 0) {
      console.log(`Retrying MongoDB connection in ${delayMs}ms (${retries} retries left)`);
      setTimeout(() => connectWithRetry(retries - 1, delayMs), delayMs);
    } else {
      console.error('Failed to connect to MongoDB after multiple attempts');
      // Exit process so deploy platform can restart if configured
      process.exit(1);
    }
  }
};

connectWithRetry();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = user.userId || user.id;
    if (!req.userId) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }
    next();
  });
};

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  tags: [String],
  fingerprint: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Debt' },
  debtPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DebtPayment' }
}, { timestamps: true });

transactionSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
transactionSchema.index({ userId: 1, isDeleted: 1 });
transactionSchema.index({ date: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

// Import models
const User = require('./src/models/User');
const SalaryPlanner = require('./src/models/SalaryPlanner');
const Debt = require('./src/models/Debt');
const DebtPayment = require('./src/models/DebtPayment');
const Budget = require('./src/models/Budget');
const ImportHistory = require('./src/models/ImportHistory');

// Import controllers
const { register, login, getProfile, updateProfile, updatePassword } = require('./src/controllers/authController');
const salaryPlannerController = require('./src/controllers/salaryPlannerController');
const debtController = require('./src/controllers/debtController');
const analyticsController = require('./src/controllers/analyticsController');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

app.use((req, res, next) => {
  if (req.path.includes('/api/csv/')) {
    req.setTimeout(120000); // 2 minutes for CSV operations
  } else {
    req.setTimeout(30000); // 30 seconds for other operations
  }
  next();
});

app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL, 'https://finflow-steel-delta.vercel.app']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Pass Transaction model to debt controller
app.use((req, res, next) => {
  req.app.locals.Transaction = Transaction;
  next();
});

// Helper for Robust Date Parsing
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const cleanStr = dateStr.toString().trim();

  // Try ISO format first (YYYY-MM-DD)
  let date = new Date(cleanStr);
  if (!isNaN(date.getTime())) return date;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // Months are 0-indexed
    const year = parseInt(dmyMatch[3], 10);
    date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  // Try MM/DD/YYYY or MM-DD-YYYY
  const mdyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10) - 1;
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
};

// CSV Preview Endpoint
app.post('/api/csv/preview', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 20;
    const skip = (page - 1) * limit;

    const results = [];
    const headers = [];
    let headerCaptured = false;
    let rowCount = 0;
    let totalRows = 0;

    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          if (!headerCaptured) {
            headers.push(...Object.keys(data));
            headerCaptured = true;
          }

          totalRows++;

          // Only store rows for the current page
          if (totalRows > skip && results.length < limit) {
            results.push(data);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    res.json({
      headers,
      data: results,
      pagination: {
        page: page,
        limit: limit,
        totalRows: totalRows,
        totalPages: Math.ceil(totalRows / limit),
        hasNextPage: page < Math.ceil(totalRows / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    res.status(500).json({ error: 'Failed to parse CSV file' });
  }
});

// CSV Import with Column Mapping & History
app.post('/api/csv/import', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    console.log('CSV import request received');
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { columnMapping } = req.body;
    console.log('Column mapping received:', columnMapping);

    if (!columnMapping) {
      return res.status(400).json({ error: 'Column mapping is required' });
    }

    const mapping = JSON.parse(columnMapping);
    const results = [];
    const errors = [];
    let processedRows = 0;
    let skippedRows = 0;
    let duplicateRows = 0;

    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          try {
            processedRows++;

            const parsedDate = parseDate(data[mapping.date]);
            const amountStr = (data[mapping.amount] || '0').toString().replace(/[^0-9.-]+/g, '');
            const parsedAmount = parseFloat(amountStr);

            // Map CSV columns to transaction fields
            const transaction = {
              userId: req.userId,
              date: parsedDate,
              amount: isNaN(parsedAmount) ? 0 : parsedAmount,
              type: (data[mapping.type] || 'expense').toLowerCase(),
              category: data[mapping.category] || 'Uncategorized',
              description: data[mapping.description] || '',
              tags: [],
              rowNumber: processedRows
            };

            // Validate required fields
            if (!transaction.date || isNaN(transaction.date.getTime())) {
              errors.push({ row: processedRows, error: 'Invalid date format' });
              skippedRows++;
              return;
            }

            if (transaction.amount <= 0) {
              errors.push({ row: processedRows, error: 'Invalid amount' });
              skippedRows++;
              return;
            }

            if (!['income', 'expense'].includes(transaction.type)) {
              transaction.type = 'expense';
            }

            // Generate unique fingerprint for deduplication
            const fingerprint = `${transaction.date.toISOString()}-${transaction.amount}-${transaction.type}-${transaction.description}-${transaction.category}`;
            transaction.fingerprint = fingerprint;

            results.push(transaction);
          } catch (error) {
            console.error('Error processing row:', error);
            errors.push({ row: processedRows, error: error.message });
            skippedRows++;
          }
        })
        .on('end', resolve)
        .on('error', (error) => {
          console.error('CSV parsing error:', error);
          reject(error);
        });
    });

    console.log(`Processed ${processedRows} rows, ${results.length} valid transactions, ${errors.length} errors`);

    // Removed the complex pre-check/restore logic for simplicity and reliability in this rewrite
    // We will rely on duplicate key error handling during insert

    // Insert valid transactions into database
    let insertedCount = 0;
    if (results.length > 0) {
      try {
        console.log('Attempting to insert', results.length, 'transactions');

        // Single insert (or insertMany with ordered: false)
        // For debugging: Force individual saves to identify silent failures
        console.log('Forcing individual saves for debugging...');

        let individualSuccess = 0;
        for (const record of results) {
          try {
            console.log(`Saving row ${record.rowNumber}...`);
            await new Transaction(record).save();
            individualSuccess++;
            insertedCount++;
          } catch (indErr) {
            if (indErr.code === 11000) {
              // Handle potential soft-deleted duplicate
              try {
                const existing = await Transaction.findOne({
                  userId: req.userId,
                  fingerprint: record.fingerprint
                });

                if (existing) {
                  if (existing.isDeleted) {
                    existing.isDeleted = false;
                    existing.amount = record.amount;
                    existing.date = record.date;
                    existing.type = record.type;
                    existing.category = record.category;
                    existing.description = record.description;

                    await existing.save();
                    individualSuccess++;
                    insertedCount++;
                    console.log(`Row ${record.rowNumber} restored from trash`);
                  } else {
                    duplicateRows++;
                  }
                } else {
                  console.warn(`Row ${record.rowNumber} collision with another user or system index`);
                  errors.push({ row: record.rowNumber, error: 'Duplicate transaction exists in system' });
                }
              } catch (findErr) {
                console.error('Error checking duplicate:', findErr);
                duplicateRows++;
              }
            } else {
              console.error(`Individual save error for row ${record.rowNumber}:`, indErr.message);
              errors.push({ row: record.rowNumber, error: indErr.message });
            }
          }
        }
        console.log(`Individual processing finished. Success: ${individualSuccess}, Duplicates: ${duplicateRows}, Errors: ${errors.length}`);






        console.log('Successfully inserted total of', insertedCount, 'transactions');
      } catch (err) {
        console.error('Fatal insertion error:', err);
        return res.status(500).json({ error: 'Database insertion failed', details: err.message });
      }
    }

    // Determine status logic
    let status = 'failed';
    if (errors.length === 0) {
      if (insertedCount > 0 || duplicateRows > 0) {
        status = 'success';
      }
    } else if (insertedCount > 0 || duplicateRows > 0) {
      status = 'partial';
    }

    // Save Import History
    try {
      await ImportHistory.create({
        userId: req.userId,
        fileName: req.file.originalname,
        status: status,
        summary: {
          totalRows: processedRows,
          insertedRows: insertedCount,
          skippedRows,
          duplicateRows,
          errors: errors.length
        }
      });
    } catch (histError) {
      console.error('Failed to save import history:', histError);
      // Don't fail the request if history save fails
    }

    const responseData = {
      success: status === 'success' || status === 'partial',
      summary: {
        totalRows: processedRows,
        insertedRows: insertedCount,
        skippedRows,
        duplicateRows,
        errors: errors.length
      },
      errors: errors.slice(0, 50), // Return more errors for debugging
      debug: {
        userId: req.userId,
        resultsLength: results.length,
        processedRows,
        duplicateRows,
        insertedCount,
        sampleTransaction: results.length > 0 ? results[0] : null
      }
    };

    console.log('Sending response:', responseData);
    res.status(200).json(responseData);

  } catch (error) {
    console.error('CSV import error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to import CSV file',
        details: error.message
      });
    }
  }
});

// CSV Dry Run Validation
app.post('/api/csv/dry-run', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    console.log('Dry run request received');

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { columnMapping } = req.body;
    if (!columnMapping) {
      return res.status(400).json({ error: 'Column mapping is required' });
    }

    const mapping = JSON.parse(columnMapping);
    const validTransactions = [];
    const errors = [];
    let processedRows = 0;
    let duplicateCount = 0;
    const allTransactions = [];

    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          try {
            processedRows++;

            const parsedDate = parseDate(data[mapping.date]);
            const amountStr = (data[mapping.amount] || '0').toString().replace(/[^0-9.-]+/g, '');
            const parsedAmount = parseFloat(amountStr);

            // Map CSV columns to transaction fields
            const transaction = {
              userId: req.userId,
              date: parsedDate,
              amount: isNaN(parsedAmount) ? 0 : parsedAmount,
              type: (data[mapping.type] || 'expense').toLowerCase(),
              category: data[mapping.category] || 'Uncategorized',
              description: data[mapping.description] || '',
              tags: [],
              rowNumber: processedRows
            };

            // Validate required fields
            if (!transaction.date || isNaN(transaction.date.getTime())) {
              errors.push({ row: processedRows, error: 'Invalid date format', data: data });
              return;
            }

            if (transaction.amount <= 0) {
              errors.push({ row: processedRows, error: 'Invalid amount', data: data });
              return;
            }

            if (!['income', 'expense'].includes(transaction.type)) {
              transaction.type = 'expense';
            }

            const fingerprint = `${transaction.date.toISOString()}-${transaction.amount}-${transaction.type}-${transaction.description}-${transaction.category}`;
            transaction.fingerprint = fingerprint;

            allTransactions.push(transaction);
          } catch (error) {
            errors.push({ row: processedRows, error: error.message, data: data });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Processed ${processedRows} rows, ${allTransactions.length} valid transactions`);

    if (allTransactions.length > 0) {
      const fingerprints = allTransactions.map(t => t.fingerprint);

      let existingTransactions = [];
      try {
        existingTransactions = await Transaction.find({
          fingerprint: { $in: fingerprints },
          isDeleted: false,
          userId: req.userId
        }).lean().maxTimeMS(8000);
      } catch (dbError) {
        console.error('Database query error:', dbError.message);
      }

      const existingFingerprints = new Set(existingTransactions.map(t => t.fingerprint));

      allTransactions.forEach(transaction => {
        if (existingFingerprints.has(transaction.fingerprint)) {
          duplicateCount++;
          errors.push({
            row: transaction.rowNumber,
            error: 'Duplicate transaction (already exists)',
            data: transaction,
            isDuplicate: true
          });
        } else {
          validTransactions.push(transaction);
        }
      });
    }

    const result = {
      success: true,
      dryRun: true,
      summary: {
        totalRows: processedRows,
        validRows: validTransactions.length,
        errorRows: errors.filter(e => !e.isDuplicate).length,
        duplicateRows: duplicateCount,
        totalErrors: errors.length
      },
      validation: {
        validTransactions: validTransactions.slice(0, 5),
        errors: errors.slice(0, 10),
        duplicates: errors.filter(e => e.isDuplicate)
      }
    };

    console.log('Dry run result:', result);
    res.json(result);
  } catch (error) {
    console.error('CSV dry run error:', error);
    res.status(500).json({ error: 'Failed to validate CSV file' });
  }
});

// Import History Endpoint
app.get('/api/csv/history', authenticateToken, async (req, res) => {
  try {
    const history = await ImportHistory.find({ userId: req.userId })
      .sort({ importDate: -1 })
      .limit(50);
    res.json(history);
  } catch (error) {
    console.error('Fetch history error:', error);
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

// Routes for Salary Planner, Transactions, Budgets, Auth, etc.
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, category, search, startDate, endDate } = req.query;
    const filter = { isDeleted: false, userId: req.userId };

    if (type) filter.type = type;
    if (category) filter.category = category;

    // Add date range filtering
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    // Add search functionality
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

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

app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactionData = { ...req.body, userId: req.userId };
    const transaction = new Transaction(transactionData);
    await transaction.save();
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const result = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
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

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const { date, amount, type, category, description } = req.body;

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
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

app.get('/api/transactions/summary', authenticateToken, async (req, res) => {
  try {
    const summary = await Transaction.aggregate([
      { $match: { isDeleted: false, userId: req.userId } },
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

app.get('/api/analytics', authenticateToken, analyticsController.getAnalytics);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ledgerflow-backend'
  });
});

// Salary Planner Routes
app.get('/api/salary-planner', authenticateToken, salaryPlannerController.getSalaryPlanner);
app.put('/api/salary-planner', authenticateToken, salaryPlannerController.updateSalaryPlanner);
app.post('/api/salary-planner/fixed-bill', authenticateToken, salaryPlannerController.addFixedBill);
app.put('/api/salary-planner/fixed-bill', authenticateToken, salaryPlannerController.updateFixedBill);
app.delete('/api/salary-planner/fixed-bill', authenticateToken, salaryPlannerController.deleteFixedBill);
app.put('/api/salary-planner/variable-expense', authenticateToken, salaryPlannerController.updateVariableExpense);
app.post('/api/salary-planner/savings-goal', authenticateToken, salaryPlannerController.addSavingsGoal);
app.put('/api/salary-planner/savings-goal', authenticateToken, salaryPlannerController.updateSavingsGoal);
app.delete('/api/salary-planner/savings-goal', authenticateToken, salaryPlannerController.deleteSavingsGoal);
app.post('/api/salary-planner/subscription', authenticateToken, salaryPlannerController.addSubscription);
app.put('/api/salary-planner/subscription', authenticateToken, salaryPlannerController.updateSubscription);
app.delete('/api/salary-planner/subscription', authenticateToken, salaryPlannerController.deleteSubscription);
app.get('/api/salary-planner/subscriptions', authenticateToken, salaryPlannerController.getSubscriptionSummary);
app.put('/api/salary-planner/cumulative-savings', authenticateToken, salaryPlannerController.updateCumulativeSavings);
app.get('/api/salary-planner/cumulative-savings', authenticateToken, salaryPlannerController.getCumulativeSavings);

// Debt Manager Routes
app.post('/api/debts', authenticateToken, debtController.createDebt);
app.get('/api/debts', authenticateToken, debtController.getAllDebts);
app.get('/api/debts/:id', authenticateToken, debtController.getDebtById);
app.patch('/api/debts/:id', authenticateToken, debtController.updateDebt);
app.patch('/api/debts/:id/close', authenticateToken, debtController.closeDebt);
app.delete('/api/debts/:id', authenticateToken, debtController.deleteDebt);
app.post('/api/debts/:id/payments', authenticateToken, debtController.addPayment);
app.get('/api/debts/:id/payments', authenticateToken, debtController.getDebtPayments);
app.patch('/api/debts/:id/payments/:paymentId', authenticateToken, debtController.updatePayment);
app.delete('/api/debts/:id/payments/:paymentId', authenticateToken, debtController.deletePayment);

// Budget Logic
const getBudgetStatus = (budget) => {
  const amount = Number(budget.amount) || 0;
  const spent = Number(budget.spent) || 0;
  if (amount <= 0) return 'under';
  const usedPercentage = (spent / amount) * 100;
  if (usedPercentage > 100) return 'over';
  if (usedPercentage >= 75) return 'on-track';
  return 'under';
};

app.get('/api/budgets', authenticateToken, async (req, res) => {
  try {
    const budgets = await Budget.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    const withStatus = budgets.map((budget) => ({
      ...budget,
      remaining: (Number(budget.amount) || 0) - (Number(budget.spent) || 0),
      status: getBudgetStatus(budget)
    }));
    res.json(withStatus);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

app.post('/api/budgets', authenticateToken, async (req, res) => {
  try {
    const { name, amount, spent = 0, category, period = 'Monthly' } = req.body;
    if (!name || !category || Number(amount) <= 0) {
      return res.status(400).json({ error: 'name, category and positive amount are required' });
    }
    const safeAmount = Number(amount);
    const safeSpent = Number(spent) || 0;
    const createdBudget = await Budget.create({
      userId: req.userId,
      name: String(name).trim(),
      amount: safeAmount,
      spent: safeSpent,
      remaining: safeAmount - safeSpent,
      category: String(category).trim(),
      period: String(period || 'Monthly').trim()
    });
    
    // Emit real-time event
    req.app.emit('budget-updated', { userId: req.userId, action: 'create', budget: createdBudget });
    
    res.status(201).json({
      ...createdBudget.toObject(),
      status: getBudgetStatus(createdBudget)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

app.put('/api/budgets/:id', authenticateToken, async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'amount', 'spent', 'category', 'period'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    if (updates.amount !== undefined) updates.amount = Number(updates.amount);
    if (updates.spent !== undefined) updates.spent = Number(updates.spent);
    if (updates.name !== undefined) updates.name = String(updates.name).trim();
    if (updates.category !== undefined) updates.category = String(updates.category).trim();
    if (updates.period !== undefined) updates.period = String(updates.period).trim();

    const existing = await Budget.findOne({ _id: req.params.id, userId: req.userId });
    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    const nextAmount = updates.amount !== undefined ? updates.amount : Number(existing.amount) || 0;
    const nextSpent = updates.spent !== undefined ? updates.spent : Number(existing.spent) || 0;
    if (nextAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    if (nextSpent < 0) {
      return res.status(400).json({ error: 'Spent cannot be negative' });
    }
    updates.remaining = nextAmount - nextSpent;
    const updatedBudget = await Budget.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    
    // Emit real-time event
    req.app.emit('budget-updated', { userId: req.userId, action: 'update', budget: updatedBudget });
    
    res.json({
      ...updatedBudget.toObject(),
      status: getBudgetStatus(updatedBudget)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

app.delete('/api/budgets/:id', authenticateToken, async (req, res) => {
  try {
    const deletedBudget = await Budget.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deletedBudget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    
    // Emit real-time event
    req.app.emit('budget-updated', { userId: req.userId, action: 'delete', budget: deletedBudget });
    
    res.json({ success: true, message: 'Budget deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// Authentication Routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/profile', authenticateToken, getProfile);
app.put('/api/auth/profile', authenticateToken, updateProfile);
app.put('/api/auth/update-password', authenticateToken, updatePassword);

// Clear All Data Endpoint
app.delete('/api/clear-all-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Delete all user data from all collections
    await Promise.all([
      Transaction.deleteMany({ userId }),
      Budget.deleteMany({ userId }),
      Debt.deleteMany({ userId }),
      DebtPayment.deleteMany({ userId }),
      SalaryPlanner.deleteMany({ userId }),
      ImportHistory.deleteMany({ userId })
    ]);

    console.log(`All data cleared for user: ${userId}`);

    res.json({
      message: 'All data cleared successfully',
      clearedCollections: ['transactions', 'budgets', 'debts', 'debtPayments', 'salaryPlanner', 'importHistory']
    });
  } catch (error) {
    console.error('Error clearing all data:', error);
    res.status(500).json({ error: 'Failed to clear all data' });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Server is started after successful MongoDB connection in connectWithRetry()
