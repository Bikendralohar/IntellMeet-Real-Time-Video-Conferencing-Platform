const Meeting = require('../models/Meeting');

const normalizeCode = (code = '') => String(code).trim().toUpperCase();

const publicMeeting = (meeting) => ({
  _id: meeting._id,
  title: meeting.title,
  meetingCode: meeting.meetingCode,
  status: meeting.status,
  host: meeting.host,
  startTime: meeting.startTime
});

// Create Meeting
const createMeeting = async (req, res) => {
  try {
    const { title, description } = req.body;

    const meeting = new Meeting({
      title,
      description,
      host: req.user._id,
      participants: [req.user._id]
    });

    await meeting.save();

    res.status(201).json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Meetings
const getMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { host: req.user._id },
        { participants: req.user._id }
      ]
    }).populate('host', 'name email');

    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMeetingByCode = async (req, res) => {
  try {
    const meetingCode = normalizeCode(req.params.meetingCode);
    const meeting = await Meeting.findOne({ meetingCode }).populate('host', 'name');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const joinMeetingByCode = async (req, res) => {
  try {
    const meetingCode = normalizeCode(req.params.meetingCode);
    const meeting = await Meeting.findOne({ meetingCode }).populate('host', 'name');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.status === 'ended') {
      return res.status(410).json({ message: 'This meeting has ended' });
    }

    await Meeting.updateOne(
      { _id: meeting._id },
      { $addToSet: { participants: req.user._id } }
    );

    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Single Meeting
const getMeetingById = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('host', 'name email')
      .populate('participants', 'name email');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Meeting
const updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Meeting
const deleteMeeting = async (req, res) => {
  try {
    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createMeeting,
  getMeetings,
  getMeetingByCode,
  joinMeetingByCode,
  getMeetingById,
  updateMeeting,
  deleteMeeting
};
