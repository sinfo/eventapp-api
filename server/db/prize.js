let mongoose = require('mongoose')

let prizeSchema = mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  img: String,
  sessions: [String],
  edition: String,
  created: Date,
  updated: Date,
})

prizeSchema.index({ id: 1 }, { unique: true })

module.exports = mongoose.model('Prize', prizeSchema)
