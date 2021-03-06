// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
var app = express();
var server = http.Server(app);
global.io = socketIO(server);
var io = global.io;

//profanity filter
var Filter = require('bad-words');
global.filter = new Filter();

var filter = global.filter;

// Game Dependencies
global.player = require('./game_modules/player.js');
global.bullet = require('./game_modules/bullet.js');
global.map = require('./game_modules/map.js');
global.room = require('./game_modules/room.js');

global.admin_password = require('./admin_data/password.js');

var player = global.player;
var map = global.map;
var room = global.room;


//Set port for Heroku
var PORT = process.env.PORT || 80;

app.set('port', PORT);
app.use('/static', express.static(__dirname + '/static'));
// Routing
app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, '/static/index.html'));
});
app.get('/admin', function(request, response) {
  response.sendFile(path.join(__dirname, '/static/index_admin.html'));
});
app.get('/howtoplay', function(request, response) {
  response.sendFile(path.join(__dirname, '/static/howtoplay.html'));
});

// Starts the server.
server.listen(PORT, function() {
  console.log('Starting server on port ' + PORT);
});

// create new room
global.room.new();


// Add the WebSocket handlers

io.on('connection', function (socket) {
  socket.on('new_player', function (data) {
    socket.emit('player_accepted');
    socket.emit('room', global.room.current);

    socket.join('room_' + global.room.current); //join the channel for given room

    player.new(socket, filter.clean(data.username.trim().substr(0, 12)));

    //emit map dimensions
    var playerMapInterval = setInterval(function () {
      if (global.player.list[socket.id]) {
        map.update(global.player.list[socket.id].room);
      } else {
        clearInterval(playerMapInterval);
      }
    }, 1000);
    map.update(global.player.list[socket.id].room);
  });

  socket.on("admin_password", function (password) {
    if (password == global.admin_password) {
      player.list[socket.id].becomeAdmin();
      socket.emit('server_alert', "Access granted");
    } else {
      socket.emit('server_alert', "Access denied");
    }
  });

  socket.on('keypress', function (data) {
    if (player.list[socket.id]) {
      player.list[socket.id].keyEvent(data.keyCode, data.bool);
    }
  });

  socket.on('chat_message', function (data) {
    if (player.list[socket.id]) {
      global.room.sendChat(player.list[socket.id], data.text);
    }
  });

  socket.on('mousedown', function (data) {
    if (player.list[socket.id]) player.list[socket.id].shoot(data);
  });

  socket.on('sound_effect', function (sound_effect) {
    if (global.player.list[socket.id]) {
      var soundEffectRoom = global.player.list[socket.id].room;

      io.to('room_' + soundEffectRoom).emit('sound_effect', {
        room: soundEffectRoom,
        sound_effect: sound_effect
      });
    }
  });

  socket.on('disconnect', function () {
    global.player.die(socket.id);

    console.log("Player " + socket.id + " disconnected.");
  });
});

setInterval(function() {
  // EMIT PLAYER STATE
  for (var id in global.room.clientList) {
    var room = id;
    io.to('room_' + room).emit('state', {
      room: room,
      player: player.getStateForClient(room),
      bullet: bullet.getList(room)
    });
  }

  //STEP BULLETS
  for (var id in player.list) {
    player.list[id].triggerWhenPressed();
  }

  for (var id in bullet.list) {
    var current_bullet = bullet.list[id].step();
    if (current_bullet == false) {
      delete bullet.list[id];
    }
  }
}, 1000 / 30);
