import mongoose from 'mongoose'

const customOrderSchema = new mongoose.Schema({
  productType: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  size: String,
  details: { type: String, required: true, maxlength: 3000 },
  customerName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: String,
  referenceUrl: String,
  referencePublicId: String,
  status: { type: String, enum: ['new', 'contacted', 'quoted', 'closed'], default: 'new' }
}, { timestamps: true })

export default mongoose.model('CustomOrder', customOrderSchema)
