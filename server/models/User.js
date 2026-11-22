import mongoose from 'mongoose'

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  size: { type: String, trim: true, maxlength: 50, default: '' },
  color: { type: String, trim: true, maxlength: 50, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 100 }
}, { _id: false })

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, maxlength: 30 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'editor', 'customer'], default: 'customer' },
  tokenVersion: { type: Number, default: 0, min: 0, select: false },
  passwordChangedAt: { type: Date, default: Date.now, select: false },
  cart: { type: [cartItemSchema], default: [] },
  wishlist: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], default: [] }
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('User', userSchema)
