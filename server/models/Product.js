import mongoose from 'mongoose'

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: String,
  alt: { type: String, default: '' },
  isPrimary: { type: Boolean, default: false }
}, { _id: true })

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  category: { type: String, required: true, trim: true },
  subcategory: { type: String, default: '', trim: true },
  description: { type: String, required: true, maxlength: 5000 },
  sellingPrice: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, min: 0 },
  sizes: [{ type: String, trim: true }],
  colors: [{ type: String, trim: true }],
  sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
  stock: { type: Number, required: true, min: 0, default: 0 },
  tags: [{ type: String, trim: true }],
  images: [imageSchema],
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ['published', 'draft'], default: 'draft' }
}, { timestamps: true })

productSchema.index({ name: 'text', description: 'text', tags: 'text' })
export default mongoose.model('Product', productSchema)
