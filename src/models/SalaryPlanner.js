const mongoose = require('mongoose');

const salaryPlannerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true }, // YYYY-MM

  // Salary Configuration
  salary: {
    amount: { type: Number, required: true, default: 0 },
    creditDate: { type: String, required: true, default: '01' }, // Day of month (01-31)
    month: { type: String, required: true } // YYYY-MM format
  },
  
  // Fixed Bills
  fixedBills: [{
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: String, required: true }, // Day of month (01-31)
    status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
    notes: { type: String, default: '' }
  }],
  
  // Variable Expense Categories
  variableExpenses: {
    categories: [{
      name: { type: String, required: true },
      budgetAmount: { type: Number, default: 0 }, // Monthly budget for this category
      currentSpent: { type: Number, default: 0 }
    }],
    totalSpent: { type: Number, default: 0 }
  },
  
  // Savings Goals
  savingsGoals: [{
    title: { type: String, required: true },
    targetAmount: { type: Number, required: true },
    targetDate: { type: Date },
    savedAmount: { type: Number, default: 0 },
    monthlyContribution: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' }
  }],
  
  // Subscriptions Manager
  subscriptions: [{
    name: { type: String, required: true },
    provider: { type: String, required: true }, // Netflix, Prime, Spotify, etc.
    monthlyCost: { type: Number, required: true },
    renewalDate: { type: String, required: true }, // Day of month (01-31)
    category: { type: String, default: 'Entertainment' }, // Entertainment, Productivity, Education, etc.
    status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
    autoRenewal: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    startDate: { type: Date, default: Date.now }
  }],
  
  // Cumulative Savings Tracker
  cumulativeSavings: {
    totalSaved: { type: Number, default: 0 },
    manualSavings: { type: Number, default: 0 }, // Track manual savings separately
    monthlyHistory: [{
      month: { type: String, required: true }, // YYYY-MM format
      saved: { type: Number, required: true },
      manualSaved: { type: Number, default: 0 }, // Manual savings for this month
      goalsCompleted: { type: Number, default: 0 }
    }]
  }
}, {
  timestamps: true
});

// Index for faster queries
salaryPlannerSchema.index({ userId: 1 });
salaryPlannerSchema.index({ month: 1 });

module.exports = mongoose.model('SalaryPlanner', salaryPlannerSchema);
