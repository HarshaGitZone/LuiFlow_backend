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
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-tracker';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

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
    req.userId = user.id;
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
  fingerprint: { type: String, required: true, unique: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

transactionSchema.index({ userId: 1, fingerprint: 1 });
transactionSchema.index({ userId: 1, isDeleted: 1 });
transactionSchema.index({ date: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

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

// Import auth controller and user model
const { register, login, getProfile, updateProfile } = require('./src/controllers/authController');
const User = require('./src/models/User');

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, category, search } = req.query;
    const filter = { isDeleted: false, userId: req.userId };
    
    if (type) filter.type = type;
    if (category) filter.category = category;
    
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

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// Authentication Routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/profile', authenticateToken, getProfile);
app.put('/api/auth/profile', authenticateToken, updateProfile);

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

// CSV Import with Column Mapping
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
    let duplicateRows = 0; // Initialize duplicateRows here

    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => {
          try {
            processedRows++;
            
            // Map CSV columns to transaction fields
            const transaction = {
              userId: req.userId,
              date: new Date(data[mapping.date] || ''),
              amount: parseFloat(data[mapping.amount] || '0'),
              type: data[mapping.type] || 'expense',
              category: data[mapping.category] || 'Uncategorized',
              description: data[mapping.description] || '',
              tags: [],
              rowNumber: processedRows // Track the actual row number
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

    // Pre-check for existing duplicates for better user feedback
    if (results.length > 0) {
      const fingerprints = results.map(t => t.fingerprint);
      
      try {
        console.log('Checking for existing fingerprints:', fingerprints);
        console.log('For user ID:', req.userId);
        
        const existingTransactions = await Transaction.find({ 
          fingerprint: { $in: fingerprints },
          userId: req.userId // Check both deleted and non-deleted to see what exists
        }).lean().maxTimeMS(5000);
        
        console.log('Found existing transactions:', existingTransactions.length);
        console.log('Existing fingerprints:', existingTransactions.map(t => ({ fingerprint: t.fingerprint, isDeleted: t.isDeleted })));
        
        // Separate deleted and non-deleted transactions
        const activeTransactions = existingTransactions.filter(t => !t.isDeleted);
        const deletedTransactions = existingTransactions.filter(t => t.isDeleted);
        
        const activeFingerprints = new Set(activeTransactions.map(t => t.fingerprint));
        const deletedFingerprints = new Set(deletedTransactions.map(t => t.fingerprint));
        
        console.log('Active fingerprints (non-deleted):', Array.from(activeFingerprints));
        console.log('Deleted fingerprints to restore:', Array.from(deletedFingerprints));
        
        // Restore deleted transactions instead of inserting duplicates
        const restorePromises = [];
        for (const transaction of results) {
          if (deletedFingerprints.has(transaction.fingerprint)) {
            const deletedRecord = deletedTransactions.find(t => t.fingerprint === transaction.fingerprint);
            if (deletedRecord) {
              restorePromises.push(
                Transaction.findByIdAndUpdate(deletedRecord._id, { isDeleted: false })
              );
              duplicateRows++;
              errors.push({ 
                row: transaction.rowNumber, 
                error: 'Transaction restored (was previously deleted)', 
                data: transaction,
                isRestored: true
              });
            }
          }
        }
        
        // Execute restore operations
        let restoredCount = 0;
        if (restorePromises.length > 0) {
          try {
            const restoreResults = await Promise.all(restorePromises);
            restoredCount = restoreResults.length;
            console.log(`Restored ${restorePromises.length} deleted transactions successfully`);
          } catch (restoreError) {
            console.error('Error during restore operations:', restoreError);
            // Continue with insertion if restore fails
          }
        }
        
        // Remove duplicates (both active and restored) from results before insertion
        const uniqueResults = results.filter(transaction => {
          if (activeFingerprints.has(transaction.fingerprint) || deletedFingerprints.has(transaction.fingerprint)) {
            if (!deletedFingerprints.has(transaction.fingerprint)) {
              duplicateRows++;
              errors.push({ 
                row: transaction.rowNumber, 
                error: 'Duplicate transaction (already exists for this user)', 
                data: transaction
              });
            }
            return false;
          }
          return true;
        });
        
        console.log(`Found ${duplicateRows} duplicates/restored, ${uniqueResults.length} unique transactions to insert`);
        
        // Replace results with only unique transactions for insertion
        results.length = 0; // Clear the array
        results.push(...uniqueResults); // Add only unique transactions
        
      } catch (dbError) {
        console.error('Pre-check database error:', dbError.message);
        // Continue with insertion if pre-check fails
      }
    }

    // Insert valid transactions into database. Skip duplicate fingerprints instead of failing entire import.
    let insertedCount = 0; // duplicateRows already initialized above
    if (results.length > 0) {
      try {
        console.log('Attempting to insert', results.length, 'transactions');
        
        // For production, use bulk insert with better error handling
        if (process.env.NODE_ENV === 'production') {
          // Process in batches to avoid timeout
          const batchSize = 25; // Further reduced batch size for better reliability
          for (let i = 0; i < results.length; i += batchSize) {
            const batch = results.slice(i, i + batchSize);
            try {
              const insertResult = await Transaction.insertMany(batch, { ordered: false });
              insertedCount += insertResult.length || batch.length;
              console.log(`Batch ${Math.floor(i/batchSize) + 1} inserted:`, insertResult.length || batch.length);
            } catch (batchError) {
              console.error(`Batch ${Math.floor(i/batchSize) + 1} failed:`, batchError.message);
              // Try to insert individual records from failed batch
              for (const record of batch) {
                try {
                  await new Transaction(record).save();
                  insertedCount++;
                } catch (individualError) {
                  console.error(`Individual record failed:`, individualError.message);
                  // Check if it's a duplicate error - if so, don't add to errors since it's already handled
                  if (individualError.code === 11000) {
                    console.log(`Skipping duplicate record: ${record.fingerprint}`);
                  } else {
                    errors.push({ 
                      row: record.rowNumber, 
                      error: `Failed to insert: ${individualError.message}` 
                    });
                  }
                }
              }
            }
          }
        } else {
          // Development: Use single insert for simplicity
          try {
            const inserted = await Transaction.insertMany(results, { ordered: false });
            insertedCount = inserted.length;
          } catch (devError) {
            console.error('Development insert failed, trying individual records:', devError.message);
            // Fallback to individual inserts
            for (const record of results) {
              try {
                await new Transaction(record).save();
                insertedCount++;
              } catch (individualError) {
                console.error(`Individual record failed:`, individualError.message);
                // Check if it's a duplicate error - if so, don't add to errors since it's already handled
                if (individualError.code === 11000) {
                  console.log(`Skipping duplicate record: ${record.fingerprint}`);
                } else {
                  errors.push({ 
                    row: record.rowNumber, 
                    error: `Failed to insert: ${individualError.message}` 
                  });
                }
              }
            }
          }
        }
        
        console.log('Successfully inserted total of', insertedCount, 'transactions');
      } catch (dbError) {
        console.error('Database insertion error:', dbError);
        const writeErrors = dbError?.writeErrors || [];
        const duplicateWriteErrors = writeErrors.filter(err => err?.code === 11000);
        const hasOnlyDuplicateErrors =
          writeErrors.length > 0 && duplicateWriteErrors.length === writeErrors.length;

        if (!hasOnlyDuplicateErrors) {
          console.error('Non-duplicate database error, throwing:', dbError);
          throw dbError;
        }

        duplicateRows = duplicateWriteErrors.length;
        insertedCount = Math.max(0, results.length - duplicateRows);
        console.log(`Duplicate handling: ${duplicateRows} duplicates, ${insertedCount} inserted`);

        duplicateWriteErrors.forEach(err => {
          const rowIndex = typeof err?.index === 'number' ? err.index + 1 : null;
          errors.push({
            row: rowIndex,
            error: 'Duplicate transaction (already exists)'
          });
        });
      }
    }

    const responseData = {
      success: true,
      summary: {
        totalRows: processedRows,
        insertedRows: insertedCount + restoredCount, // Include both inserted and restored
        skippedRows,
        duplicateRows,
        errors: errors.length
      },
      errors: errors.slice(0, 10) // Return first 10 errors for display
    };

    console.log('Sending response:', responseData);
    
    // Ensure response is sent and connection is closed properly
    res.status(200).json(responseData);
    console.log('Response sent successfully');
    
  } catch (error) {
    console.error('CSV import error:', error);
    
    // Ensure we always send a response, even on error
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to import CSV file',
        details: error.message 
      });
    } else {
      console.error('Response already sent, cannot send error response');
    }
  }
});

// CSV Dry Run Validation (Validate Only)
app.post('/api/csv/dry-run', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    console.log('Dry run request received');
    
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { columnMapping } = req.body;
    console.log('Column mapping received:', columnMapping);
    
    if (!columnMapping) {
      console.log('No column mapping provided');
      return res.status(400).json({ error: 'Column mapping is required' });
    }

    const mapping = JSON.parse(columnMapping);
    console.log('Parsed mapping:', mapping);
    
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
            
            // Map CSV columns to transaction fields
            const transaction = {
              userId: req.userId,
              date: new Date(data[mapping.date] || ''),
              amount: parseFloat(data[mapping.amount] || '0'),
              type: data[mapping.type] || 'expense',
              category: data[mapping.category] || 'Uncategorized',
              description: data[mapping.description] || '',
              tags: [],
              rowNumber: processedRows // Track the actual row number
            };

            // Validate required fields
            if (!transaction.date || isNaN(transaction.date.getTime())) {
              errors.push({ row: processedRows, error: 'Invalid date format', data: data });
              return;
            }

            if (isNaN(transaction.amount) || transaction.amount <= 0) {
              errors.push({ row: processedRows, error: 'Invalid amount', data: data });
              return;
            }

            if (!['income', 'expense'].includes(transaction.type)) {
              transaction.type = 'expense'; // Default to expense
            }

            // Generate unique fingerprint for deduplication
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

    // Now check for duplicates in database for all valid transactions
    if (allTransactions.length > 0) {
      const fingerprints = allTransactions.map(t => t.fingerprint);
      
      let existingTransactions = [];
      try {
        existingTransactions = await Transaction.find({ 
          fingerprint: { $in: fingerprints },
          isDeleted: false,
          userId: req.userId // Only check current user's transactions
        }).lean().maxTimeMS(8000);
      } catch (dbError) {
        console.error('Database query error:', dbError.message);
        console.log('Continuing without duplicate check due to database timeout');
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
        validTransactions: validTransactions.slice(0, 5), // Show first 5 valid transactions as preview
        errors: errors.slice(0, 10), // Return first 10 errors for display
        duplicates: errors.filter(e => e.isDuplicate) // Return ALL duplicates (not limited to 5)
      }
    };

    console.log('Dry run result:', result);
    res.json(result);
  } catch (error) {
    console.error('CSV dry run error:', error);
    res.status(500).json({ error: 'Failed to validate CSV file' });
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
