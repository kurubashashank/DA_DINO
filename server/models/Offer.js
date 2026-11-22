import mongoose from 'mongoose'

const offerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  type: { type: String, enum: ['percentage', 'flat', 'shipping'], default: 'percentage' },
  value: { type: Number, min: 0, default: 0 },
  minimumOrder: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['active', 'draft', 'expired'], default: 'draft' },
  expiresAt: { type: Date, default: null }
}, { timestamps: true })

export default mongoose.model('Offer', offerSchema)
