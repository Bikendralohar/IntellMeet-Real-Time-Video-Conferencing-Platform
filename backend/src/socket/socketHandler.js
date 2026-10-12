const participantInfo = (socket) => ({
  socketId: socket.id,
  userName: socket.data?.userName || '',
  userId: socket.data?.userId || '',
  micOn: socket.data?.media?.micOn !== false,
  cameraOn: socket.data?.media?.cameraOn !== false,
  sharing: !!socket.data?.media?.sharing,
  micAvailable: socket.data?.media?.micAvailable !== false
});

const parseJoinPayload = (payload) => {
  if (typeof payload === 'string') {
    return { meetingCode: payload, userName: '', userId: '' };
  }
  if (payload && typeof payload === 'object') {
    return {
      meetingCode: payload.meetingCode,
      userName: payload.userName || '',
      userId: payload.userId || ''
    };
  }
  return { meetingCode: '', userName: '', userId: '' };
};

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-meeting', async (payload) => {
      const { meetingCode, userName, userId } = parseJoinPayload(payload);
      if (!meetingCode || typeof meetingCode !== 'string') return;

      const others = await io.in(meetingCode).fetchSockets();

      socket.join(meetingCode);
      socket.data.meetingCode = meetingCode;
      socket.data.userName = userName;
      socket.data.userId = userId;
      socket.data.signaling = typeof payload === 'object';
      socket.data.media = socket.data.media || { micOn: true, cameraOn: true, sharing: false, micAvailable: true };

      socket.emit('room-participants', {
        participants: others
          .filter((member) => member.id !== socket.id && member.data?.signaling !== false)
          .map(participantInfo)
      });

      socket.to(meetingCode).emit('user-joined', {
        ...participantInfo(socket),
        signaling: socket.data.signaling !== false,
        message: userName ? `${userName} joined the meeting` : 'A new user joined the meeting!'
      });
    });

    socket.on('send-message', ({ meetingCode, message, userName }) => {
      if (!meetingCode || !message) return;
      io.to(meetingCode).emit('receive-message', {
        message,
        userName,
        time: new Date().toISOString()
      });
    });

    socket.on('media-state', ({ meetingCode, micOn, cameraOn, sharing, micAvailable }) => {
      if (!meetingCode) return;
      socket.data.media = { micOn, cameraOn, sharing, micAvailable };
      socket.to(meetingCode).emit('media-state', {
        socketId: socket.id,
        micOn,
        cameraOn,
        sharing,
        micAvailable
      });
    });

    const relay = (eventName) => {
      socket.on(eventName, ({ meetingCode, targetId, offer, answer, candidate }) => {
        if (!targetId) return;
        io.to(targetId).emit(eventName, {
          meetingCode,
          fromId: socket.id,
          offer,
          answer,
          candidate
        });
      });
    };

    relay('webrtc-offer');
    relay('webrtc-answer');
    relay('webrtc-ice');

    socket.on('leave-meeting', (meetingCode) => {
      const room = meetingCode || socket.data?.meetingCode;
      socket.leave(room);
      socket.data.meetingCode = undefined;
      if (room) {
        socket.to(room).emit('user-left', {
          socketId: socket.id,
          message: socket.data?.userName
            ? `${socket.data.userName} left the meeting`
            : 'A user left the meeting!'
        });
      }
    });

    socket.on('disconnect', () => {
      const meetingCode = socket.data?.meetingCode;
      if (meetingCode) {
        socket.to(meetingCode).emit('user-left', {
          socketId: socket.id,
          message: socket.data?.userName
            ? `${socket.data.userName} left the meeting`
            : 'A user left the meeting!'
        });
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
