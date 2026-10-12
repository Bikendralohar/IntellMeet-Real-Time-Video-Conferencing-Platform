const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  meetingCode: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended'],
    default: 'scheduled'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  description: {
    type: String,
    default: ''
  },
  recording: {
    type: String,
    default: ''
  },
  summary: {
    type: String,
    default: ''
  }
}, { timestamps: true });

meetingSchema.pre('save', function() {
  if (!this.meetingCode) {
    this.meetingCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  }
});

module.exports = mongoose.model('Meeting', meetingSchema);