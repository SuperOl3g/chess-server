'use strict';

const PORT = 3056;

var io     = require('socket.io').listen(PORT),
    colors = require('colors');

console.log('Server started...'.gray);

let waitQueue = [],
    gameCounter = 1;

// следим за созданием игровых комнат
Object.observe(io.sockets.adapter.rooms, (changes) => {
  if (changes[0].type == 'add' && /^game.+/.test(changes[0].name)) {
    console.log(`${changes[0].name} has been started`);
    // уведомляем о создании новой комнаты
    io.sockets.in('roomsWatchers').emit('roomsList', getExtendedRoomsList());
    let newRoom = io.sockets.adapter.rooms[changes[0].name];

    // вешаем обработчик оповещения на случай измения кол-ва людей в комнате
    Object.observe(newRoom, (changes) => {
      if (changes[0].type == 'update')
        io.sockets.in('roomsWatchers').emit('roomsList', getExtendedRoomsList());
    });
  }
});


Array.observe(waitQueue, (changes) => {
  console.log(` in wait: ${waitQueue.length}`.gray);

  // создание новых игр для игроков в очереди
  if (waitQueue.length >= 2) {
    let roomID = `game${gameCounter++}`,
        whiteNumber = Math.floor( Math.random() );

    waitQueue.splice(0,2).forEach( (player, index) => {

      player.join(roomID);
      let playerColor = index == whiteNumber ? 'white' : 'black';
      player.emit('game_found', {
        roomID: roomID,
        color: playerColor
      });

      // пробрасываем ходы игроков
      ['move', 'promotion', 'castling', 'mate', 'drow'].forEach( (turnType) => {
        player.on(`turn_${turnType}`, (eventArgs) => {
          eventArgs = eventArgs || {};
          eventArgs.playerColor = playerColor;
          player.broadcast.to(roomID).emit(`player_${turnType}`, eventArgs);
        });
      });

      // заканчиваем игру, если один из игроков вышел
      ['room_leave', 'disconnect'].forEach( (event) => {
        player.on( event, () => {
          player.leave(roomID);
          console.log(`${player.id} has leaved from ${roomID}`.red);
          io.sockets.in(roomID).emit('game_end', {
            msg: 'leave',
            winnerColor: playerColor == 'white' ? 'black' : 'white'
          });
          io.sockets.in(roomID).removeAllListeners('room_leave');

          // убираем всех людей из комнаты игры, тем самым закрывая ее
          Object.keys( io.sockets.in(roomID).sockets).forEach( (socketID) => io.sockets.connected[socketID].leave(roomID) );
        });
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

  // подписка на изменение списка комнат
  socket.on('roomsList_subscribe', () => {
    // отправка текущего состояния вновь прибывшему
    socket.emit('roomsList', getExtendedRoomsList());
    socket.join('roomsWatchers');

    // отписка от изменений списка комнат
    socket.on('roomsList_unsubscribe', () => {
      socket.leave('roomsWatchers');
    });
  });

  // ставим игрока в очередь на поиск
  socket.on('game_find', onGameFind);

  function onGameFind() {
    waitQueue.push(socket);
    socket.removeAllListeners('game_find');

    ['game_stopFinding', 'disconnect'].forEach ((event) => {
      socket.on( event, () => {
        waitQueue.splice(waitQueue.indexOf(socket), 1);
        socket.removeAllListeners('game_stopFinding');
        socket.on('game_find', onGameFind);
      });
    });
  }

  // подключение для просмотра чужих игр
  socket.on('room_enter', (roomID) => {
    if( getRoomsList().find( (room) => room == roomID ) ) {
      socket.join(roomID);
      socket.on('room_leave', () => {
        socket.leave(roomID);
        socket.removeAllListeners('room_leave');
      });
    }
  });
});

function getRoomsList() {
  return Object.keys(io.sockets.adapter.rooms).filter( (roomID) => /^game.+/.test(roomID) );
}

function getExtendedRoomsList() {
  return getRoomsList().map( (roomID) => {
    return {
      roomID: roomID,
      length: io.sockets.adapter.rooms[roomID].length
    }
  });
}
