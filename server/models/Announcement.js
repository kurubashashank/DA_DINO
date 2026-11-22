import mongoose from 'mongoose'

const announcementSchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true, maxlength: 300 },
  enabled: { type: Boolean, default: true },
  mode: { type: String, enum: ['scroll', 'static'], default: 'scroll' },
  scrollSpeed: { type: String, enum: ['slow', 'normal', 'fast'], default: 'normal' },
  linkText: { type: String, trim: true, maxlength: 60, default: '' },
  linkUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  openInNewTab: { type: Boolean, default: false },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  priority: { type: Number, default: 0, min: 0, max: 10000 },
  displayOrder: { type: Number, default: 0, min: 0, max: 10000 }
}, { timestamps: true, strict: 'throw' })

announcementSchema.index({ enabled: 1, startsAt: 1, endsAt: 1, priority: -1, displayOrder: 1 })

export default mongoose.model('Announcement', announcementSchema)
