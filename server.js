'use strict';

const PORT = 3056;

var io     = require('socket.io').listen(PORT),
    colors = require('colors');

console.log('Server started...'.gray);

let waitQueue = [],
    gameCounter = 1;


Object.observe(io.sockets.adapter.rooms, (changes) => {
  if (changes[0].type == 'add' && /^game.+/.test(changes[0].name))
    console.log(`${changes[0].name} has been started`);
});

// создание новых комнат для игроков в очереди
Array.observe(waitQueue, (changes) => {
  if (changes[0].addedCount == 0) return;
  console.log(`${waitQueue[changes[0].index].id} has been added to waitQueue`);

  console.log(` in wait: ${waitQueue.length}`.gray);
  if (waitQueue.length >= 2) {
    let roomID = `game${gameCounter++}`;

    // решаем, кто играет белыми
    let whiteNumber = Math.floor( Math.random() );

    waitQueue.splice(0,2).forEach( (player, index) => {
      player.join(roomID);
      let playerColor = index == whiteNumber ? 'white' : 'black';
      player.emit('game_found', {
        roomID: roomID,
        color: playerColor
      });

      // прокидываем ходы игроков
      let turnTypes = ['move', 'promotion', 'castling'];
      turnTypes.forEach( (turnType) => {
        player.on(`turn_${turnType}`, (eventArgs) => {
          eventArgs = eventArgs || {};
          eventArgs.playerColor = playerColor;
          io.sockets.in(roomID).emit(`player_${turnType}`, eventArgs);
        });
      })

      // заканчиваем игру, если один из игроков вышел
      player.on('room_leave', () => {
        player.leave(roomID);
        console.log(`${player.id} has leaved from ${roomID}`.red);
        io.sockets.in(roomID).emit('game_end', {
          msg: 'leave',
          winnerColor: playerColor == 'white' ? 'black' : 'white'
        });
        io.sockets.in(roomID).removeAllListeners('room_leave');
        io.sockets.in(roomID).leave(roomID);
      });
    });
    console.log(` in wait: ${waitQueue.length}`.gray);
  }
});




io.sockets.on('connection', (socket) => {
  console.log(`${socket.id} come online`.green);

  socket.on('disconnect', () => {
    console.log(`${socket.id} come offline`.red);
  });

  // получение списка комнат
  socket.on('roomsList_get', () => {
    socket.emit('roomsList', getRoomsList().map( (roomID) => {
      return {
        roomID: roomID,
        length: io.sockets.adapter.rooms[roomID].length
      }
    }) );
  });

  // ставим игрока в очередь на поиск
  socket.on('game_find', () => {
    waitQueue.push(socket);
    socket.removeAllListeners('game_find');

    socket.on('game_stopFinding', () => {
      // TODO: удаление из очереди
    });
  });

  // подключение для просмотра чужих игр
  socket.on('room_enter', (roomID) => {
    if( getRoomsList().find( (room) => room == roomID ) ) {
      socket.join(roomID);
      socket.on('room_leave', () => {
        socket.leave(roomID);
        socket.removeAllListeners('room_leave');
      });
    }
  })
});

function getRoomsList() {
  return Object.keys(io.sockets.adapter.rooms).filter( (roomID) => /^game.+/.test(roomID) );
}
