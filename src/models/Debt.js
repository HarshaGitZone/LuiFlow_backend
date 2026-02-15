const mongoose = require('mongoose');

const debtSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lenderName: { type: String, required: true, trim: true },
  debtType: { 
    type: String, 
    enum: ['personal', 'bank', 'informal'], 
    required: true 
  },
  principalAmount: { type: Number, required: true, min: 0 },
  startDate: { type: Date, required: true },
  tenure: { 
    type: Number, 
    required: false,
    min: 1,
    comment: 'Tenure in months'
  },
  interestType: { 
    type: String, 
    enum: ['none', 'simple', 'compound'], 
    required: true,
    default: 'none'
  },
  interestRate: { 
    type: Number, 
    required: function() {
      return this.interestType !== 'none';
    },
    min: 0,
    max: 100,
    default: 0
  },
  compoundFrequency: { 
    type: String, 
    enum: ['monthly', 'quarterly', 'yearly'],
    required: function() {
      return this.interestType === 'compound';
    },
    default: 'yearly'
  },
  notes: { type: String, trim: true, maxlength: 500 },
  status: { 
    type: String, 
    enum: ['active', 'closed'], 
    required: true, 
    default: 'active' 
  },
  closedDate: { type: Date },
  isDeleted: { type: Boolean, default: false }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
debtSchema.index({ userId: 1, status: 1 });
debtSchema.index({ userId: 1, isDeleted: 1 });
debtSchema.index({ startDate: -1 });

// Virtual fields for computed values
debtSchema.virtual('totalPaid', {
  ref: 'DebtPayment',
  localField: '_id',
  foreignField: 'debtId',
  match: { isDeleted: false },
  options: { sort: { paymentDate: 1 } }
});

debtSchema.virtual('ageInMonths').get(function() {
  const now = new Date();
  const start = new Date(this.startDate);
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
});

debtSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const start = new Date(this.startDate);
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
});

// Method to calculate interest accrued
debtSchema.methods.calculateInterest = function(asOfDate = new Date()) {
  if (this.interestType === 'none' || this.status === 'closed') {
    return 0;
  }

  const startDate = new Date(this.startDate);
  const endDate = new Date(asOfDate);
  
  // Don't calculate interest beyond closed date
  if (this.closedDate && endDate > this.closedDate) {
    endDate.setTime(this.closedDate.getTime());
  }

  if (endDate <= startDate) {
    return 0;
  }

  const principal = this.principalAmount;
  const rate = this.interestRate / 100; // Convert percentage to decimal

  if (this.interestType === 'simple') {
    // Simple Interest: P * R * T
    const years = this.ageInDays / 365.25;
    return principal * rate * years;
  } else if (this.interestType === 'compound') {
    // Compound Interest: P * (1 + r/n)^(n*t) - P
    let periodsPerYear = 1;
    switch (this.compoundFrequency) {
      case 'monthly': periodsPerYear = 12; break;
      case 'quarterly': periodsPerYear = 4; break;
      case 'yearly': periodsPerYear = 1; break;
    }
    
    const years = this.ageInDays / 365.25;
    const totalPeriods = years * periodsPerYear;
    const ratePerPeriod = rate / periodsPerYear;
    
    return principal * Math.pow(1 + ratePerPeriod, totalPeriods) - principal;
  }

  return 0;
};

// Method to calculate outstanding balance
debtSchema.methods.calculateOutstandingBalance = async function(asOfDate = new Date()) {
  const interestAccrued = this.calculateInterest(asOfDate);
  const totalPayable = this.principalAmount + interestAccrued;
  
  // Get total payments made up to the specified date
  const mongoose = require('mongoose');
  const DebtPayment = mongoose.model('DebtPayment');
  
  const payments = await DebtPayment.find({
    debtId: this._id,
    paymentDate: { $lte: asOfDate },
    isDeleted: false
  });
  
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  
  return Math.max(0, totalPayable - totalPaid);
};

// Method to calculate future projections
debtSchema.methods.calculateProjections = function(years = 2) {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + years);
  
  const projectedInterest = this.calculateInterest(futureDate);
  const projectedTotal = this.principalAmount + projectedInterest;
  
  return {
    projectedDate: futureDate,
    projectedInterest,
    projectedTotal,
    yearsProjected: years
  };
};

// Pre-save validation
debtSchema.pre('save', function(next) {
  // Validate interest rate based on interest type
  if (this.interestType === 'none') {
    this.interestRate = 0;
  } else if (this.interestRate <= 0) {
    return next(new Error('Interest rate must be greater than 0 when interest type is not "none"'));
  }

  // Set closed date when status changes to closed
  if (this.isModified('status') && this.status === 'closed' && !this.closedDate) {
    this.closedDate = new Date();
  }

  next();
});

const Debt = mongoose.model('Debt', debtSchema);

module.exports = Debt;
