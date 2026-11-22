import 'dotenv/config'
import mongoose from 'mongoose'
import Product from './models/Product.js'
import { sampleProducts } from './data/sampleProducts.js'

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env before seeding.')
await mongoose.connect(process.env.MONGODB_URI)
await Product.deleteMany({})
await Product.insertMany(sampleProducts)
console.log(`Seeded ${sampleProducts.length} sample products.`)
await mongoose.disconnect()
