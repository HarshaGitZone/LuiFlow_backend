const mongoose = require('mongoose');

const debtPaymentSchema = new mongoose.Schema({
  debtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Debt', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentDate: { type: Date, required: true },
  amountPaid: { type: Number, required: true, min: 0 },
  paymentMode: { 
    type: String, 
    enum: ['cash', 'UPI', 'bank_transfer', 'cheque', 'other'], 
    required: true,
    default: 'cash'
  },
  notes: { type: String, trim: true, maxlength: 300 },
  isDeleted: { type: Boolean, default: false }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
debtPaymentSchema.index({ debtId: 1, paymentDate: -1 });
debtPaymentSchema.index({ userId: 1, isDeleted: 1 });
debtPaymentSchema.index({ debtId: 1, isDeleted: 1 });

// Virtual for formatted payment date
debtPaymentSchema.virtual('formattedPaymentDate').get(function() {
  return this.paymentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Pre-save validation
debtPaymentSchema.pre('save', function(next) {
  // Ensure payment date is not in the future
  if (this.paymentDate > new Date()) {
    return next(new Error('Payment date cannot be in the future'));
  }

  // Ensure payment date is not before debt start date
  mongoose.model('Debt').findById(this.debtId).then(debt => {
    if (debt && this.paymentDate < debt.startDate) {
      return next(new Error('Payment date cannot be before debt start date'));
    }
    next();
  }).catch(err => next(err));
});

const DebtPayment = mongoose.model('DebtPayment', debtPaymentSchema);

module.exports = DebtPayment;
