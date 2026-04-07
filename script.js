// ChatHub Client Script - Exact clone functionality
(function() {
  'use strict';

  // Elements
  const joinScreen = document.getElementById('join-screen');
  const chatScreen = document.getElementById('chat-screen');
  const usernameInput = document.getElementById('username-input');
  const roomInput = document.getElementById('ip-input');
  const joinBtn = document.getElementById('join-btn');
  const joinError = document.getElementById('join-error');
  const roomDisplay = document.getElementById('room-display');
  const headerIp = document.getElementById('header-ip');
  const headerUsername = document.getElementById('header-username');
  const userCount = document.getElementById('user-count');
  const membersList = document.getElementById('members-list');
  const messagesArea = document.getElementById('messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const imageBtn = document.getElementById('image-btn');
  const imageInput = document.getElementById('image-input');
  const replyPreview = document.getElementById('reply-preview');
  const replyText = document.getElementById('reply-text');
  const replyCancel = document.getElementById('reply-cancel');
  const leaveBtn = document.getElementById('leave-btn');
  const clearBtn = document.getElementById('clear-btn');
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');

  let socket = null;
  let currentRoom = null;
  let currentUsername = null;
  let replyTo = null;
  let typingTimer = null;
  let users = [];

  // Init socket
  function initSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('join-error', (msg) => {
      showJoinError(msg);
    });

    socket.on('room-joined', (data) => {
      joinChat(data.room, data.users, data.messages);
    });

    socket.on('user-joined', (data) => {
      users = data.users;
      updateMembers();
      updateUserCount();
    });

    socket.on('user-left', (data) => {
      users = data.users;
      updateMembers();
      updateUserCount();
    });

    socket.on('chat-message', (msg) => {
      addMessage(msg);
      hideTyping();
    });

    socket.on('user-typing', ({username, isTyping}) => {
      updateTypingIndicator(username, isTyping);
    });

    socket.on('clear-chat', () => {
      messagesArea.innerHTML = '<div class="welcome-msg"><span>— Chat cleared —</span></div>';
      hideReply();
    });
  }

  // Join room
  joinBtn.addEventListener('click', joinRoom);
  roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  function joinRoom() {
    const username = usernameInput.value.trim();
    const room = roomInput.value.trim();
    if (!username || !room) {
      showJoinError('Username and room code required');
      return;
    }
    joinError.textContent = '';
    joinBtn.disabled = true;
    joinBtn.querySelector('span').textContent = 'CONNECTING…';
    if (socket.connected) {
    socket.emit('join-room', { username, room });
  } else {
    socket.on('connect', () => {
      socket.emit('join-room', { username, room });
    });
  }
  }
  

  function showJoinError(msg) {
    joinError.textContent = msg;
    joinBtn.disabled = false;
    joinBtn.querySelector('span').textContent = 'CONNECT';
  }

  function joinChat(room, usersList, messages) {
    currentRoom = room;
    currentUsername = usernameInput.value  // Set by server? Wait, client doesn't have, use local
    // Note: server sets socket.username but client needs to store
    joinScreen.classList.remove('active');
    chatScreen.classList.add('active');

    roomDisplay.textContent = room;
    headerIp.textContent = room;
    headerUsername.textContent = usernameInput.value;

    users = usersList;
    updateMembers();
    updateUserCount();

    messagesArea.innerHTML = '<div class="welcome-msg"><span>— Start of conversation —</span></div>';
    messages.forEach(addMessage);

    messageInput.focus();
    scrollToBottom();
  }

  // Messages
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Escape') {
      hideReply();
    }
  });

  messageInput.addEventListener('input', handleTyping);

  function handleTyping() {
    socket.emit('typing', true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit('typing', false);
    }, 1000);
  }

  function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    const msgData = {
      message,
      replyTo: replyTo ? { author: replyTo.author, content: replyTo.content } : null
    };
    socket.emit('send-message', msgData);

    messageInput.value = '';
    hideTyping();
    hideReply();
  }

  function addMessage(msg) {
    const msgEl = document.createElement('div');
    msgEl.className = `msg ${msg.author === currentUsername ? 'self' : 'other'}`;

    let content = '';
    if (msg.type === 'text') {
      content = msg.content;
    } else if (msg.type === 'image') {
      content = `<img src="${msg.content}" alt="Image" class="msg-image" onclick="showImageOverlay('${msg.content}')">`;
    } else if (msg.type === 'system') {
      msgEl.className = 'system-msg';
      content = msg.content;
    }

    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    msgEl.innerHTML = `
      <div class="msg-meta">
        <span class="msg-author">${msg.author}</span>
        <span class="msg-time">${time}</span>
      </div>
      ${replyToHtml(msg.replyTo)}
      <div class="msg-bubble">${content}</div>
    `;

    msgEl.addEventListener('click', () => setReply(msg));
    messagesArea.appendChild(msgEl);
    scrollToBottom();
  }

  function replyToHtml(reply) {
    if (!reply) return '';
    return `
      <div class="reply-block">
        <div class="reply-author">${reply.author}</div>
        <div class="reply-content">${reply.content}</div>
      </div>
    `;
  }

  // Image upload
  imageBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', uploadImage);

  async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      messageInput.placeholder = 'Uploading…';
      const res = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      const { url } = await res.json();

      const msgData = {
        imageUrl: url,
        replyTo: replyTo ? { author: replyTo.author, content: replyTo.content } : null
      };
      socket.emit('send-image', msgData);

      imageInput.value = '';
      hideReply();
    } catch (err) {
      console.error('Upload failed', err);
      addSystemMessage('Image upload failed');
    }
  }

  // Reply
  function setReply(msg) {
    replyTo = { author: msg.author, content: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '') };
    replyText.textContent = `${replyTo.author}: ${replyTo.content}`;
    replyPreview.classList.add('active');
    messageInput.focus();
  }

  replyCancel.addEventListener('click', hideReply);

  function hideReply() {
    replyTo = null;
    replyPreview.classList.remove('active');
  }

  // Typing
  function updateTypingIndicator(username, isTyping) {
    if (isTyping) {
      typingIndicator.innerHTML = `<span class="typing-name">${username}</span> <div class="typing-dots"><span></span><span></span><span></span></div>`;
    } else {
      hideTyping();
    }
  }

  function hideTyping() {
    typingIndicator.innerHTML = '';
  }

  // Members & count
  function updateMembers() {
    membersList.innerHTML = '';
    users.forEach(u => {
      const isMe = u === currentUsername;
      const item = document.createElement('div');
      item.className = `member-item ${isMe ? 'member-me' : ''}`;
      item.innerHTML = `
        <span class="member-dot"></span>
        <span class="member-name">${u}</span>
        ${isMe ? '<span class="member-you-tag">YOU</span>' : ''}
      `;
      membersList.appendChild(item);
    });
  }

  function updateUserCount() {
    userCount.textContent = users.length;
  }

  // UI actions
  leaveBtn.addEventListener('click', leaveRoom);
  clearBtn.addEventListener('click', () => socket.emit('clear-chat'));
  menuToggle.addEventListener('click', (e) =>{
    e.preventDefault();
    toggleSidebar();
  });

  function leaveRoom() {
    socket.disconnect();
    location.reload();
  }

  function toggleSidebar() {
    sidebar.classList.toggle('open');
  }

  // Image overlay
  let overlay = null;
  window.showImageOverlay = function(src) {
    overlay = document.createElement('div');
    overlay.className = 'img-overlay';
    overlay.innerHTML = `<img src="${src}" alt="Full image">`;
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
  };

  // Utils
  function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  function addSystemMessage(msg) {
    const sys = document.createElement('div');
    sys.className = 'system-msg';
    sys.textContent = msg;
    messagesArea.appendChild(sys);
    scrollToBottom();
  }

  // Init
  initSocket();
  messageInput.focus();

  document.addEventListener('click',(e)
        =>{
          if(sidebar.classList.contains('open'))
          {
            if(!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
              sidebar.classList.remove('open');
            }
          }
        });      
})();

