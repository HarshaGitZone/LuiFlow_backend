const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  buyPrice: { type: Number, required: true, min: 0 },
  buyDate: { type: Date, required: true },
  currentPrice: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  currency: { type: String, default: 'USD' },
  exchange: { type: String, default: 'NASDAQ' },
  notes: { type: String, trim: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Compound indexes for efficient queries
portfolioSchema.index({ userId: 1, symbol: 1 }, { unique: true });
portfolioSchema.index({ userId: 1, isDeleted: 1 });
portfolioSchema.index({ symbol: 1 });

// Virtual fields for portfolio calculations
portfolioSchema.virtual('totalInvested').get(function() {
  return this.quantity * this.buyPrice;
});

portfolioSchema.virtual('currentValue').get(function() {
  return this.quantity * this.currentPrice;
});

portfolioSchema.virtual('unrealizedPnL').get(function() {
  return this.currentValue - this.totalInvested;
});

portfolioSchema.virtual('unrealizedPnLPercentage').get(function() {
  if (this.totalInvested === 0) return 0;
  return ((this.currentValue - this.totalInvested) / this.totalInvested) * 100;
});

// Ensure virtuals are included in JSON output
portfolioSchema.set('toJSON', { virtuals: true });
portfolioSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update lastUpdated
portfolioSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Portfolio', portfolioSchema);
