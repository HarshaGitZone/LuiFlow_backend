const mongoose = require('mongoose');

const salaryPlannerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
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
  }]
}, {
  timestamps: true
});

// Index for faster queries
salaryPlannerSchema.index({ userId: 1 });
salaryPlannerSchema.index({ month: 1 });

module.exports = mongoose.model('SalaryPlanner', salaryPlannerSchema);
