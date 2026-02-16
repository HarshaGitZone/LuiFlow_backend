const mongoose = require('mongoose');

const importHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    importSessionId: {
        type: String
    },
    commitOrder: {
        type: Number
    },
    commitPolicy: {
        type: String,
        enum: ['per-user-serialized'],
        default: 'per-user-serialized'
    },
    status: {
        type: String,
        enum: ['success', 'failed', 'partial'],
        default: 'success'
    },
    summary: {
        totalRows: { type: Number, default: 0 },
        insertedRows: { type: Number, default: 0 },
        skippedRows: { type: Number, default: 0 },
        duplicateRows: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
    }
}, {
    timestamps: { createdAt: 'importDate', updatedAt: false }
});

// Index for fast retrieval by user and date
importHistorySchema.index({ userId: 1, importDate: -1 });
importHistorySchema.index({ userId: 1, commitOrder: -1 });

module.exports = mongoose.model('ImportHistory', importHistorySchema);
