const express = require('express');
const router = express.Router();
const {
  createMeeting,
  getMeetings,
  getMeetingByCode,
  joinMeetingByCode,
  getMeetingById,
  updateMeeting,
  deleteMeeting
} = require('../controllers/meetingController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createMeeting);
router.get('/', protect, getMeetings);
router.get('/code/:meetingCode', protect, getMeetingByCode);
router.post('/code/:meetingCode/join', protect, joinMeetingByCode);
router.get('/:id', protect, getMeetingById);
router.put('/:id', protect, updateMeeting);
router.delete('/:id', protect, deleteMeeting);

module.exports = router;
