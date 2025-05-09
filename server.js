const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game state
const rooms = new Map();

// Card deck generation
const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards(deck, numPlayers) {
  const hands = Array(numPlayers).fill().map(() => []);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < numPlayers; j++) {
      if (deck.length > 0) {
        hands[j].push(deck.pop());
      }
    }
  }
  return hands;
}

// Helper: assign a numeric strength to each hand type
function getHandStrength(hand) {
  if (!hand || !hand.type) return 0;
  const typeOrder = [
    'high_card',
    'pair',
    'two_pairs',
    'triple',
    'triple_high',
    'full_house',
    'quadra',
    'quadra_high'
  ];
  const typeStrength = typeOrder.indexOf(hand.type);
  if (typeStrength === -1) return 0;
  const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  let mainRank = 0, kickerRank = 0;
  if (hand.type === 'quadra_high' || hand.type === 'triple_high' || hand.type === 'full_house') {
    // Use both ranks for strength
    mainRank = rankOrder.indexOf(hand.rank1);
    kickerRank = rankOrder.indexOf(hand.rank2);
    // Ensure mainRank is the higher (for full_house, triple is main)
    return typeStrength * 10000 + mainRank * 100 + kickerRank;
  } else if (hand.type === 'two_pairs') {
    // Use both pairs, higher pair is main
    mainRank = Math.max(rankOrder.indexOf(hand.rank1), rankOrder.indexOf(hand.rank2));
    kickerRank = Math.min(rankOrder.indexOf(hand.rank1), rankOrder.indexOf(hand.rank2));
    return typeStrength * 10000 + mainRank * 100 + kickerRank;
  } else if (hand.rank) {
    mainRank = rankOrder.indexOf(hand.rank);
    return typeStrength * 10000 + mainRank * 100;
  }
  return typeStrength * 10000;
}

// Helper: check if a declared hand exists in a pool of cards
function handExistsForBluff(hand, allCards) {
  // Count occurrences of each rank
  const rankCounts = {};
  for (const card of allCards) {
    rankCounts[card.value] = (rankCounts[card.value] || 0) + 1;
  }
  switch (hand.type) {
    case 'high_card':
      return rankCounts[hand.rank] >= 1;
    case 'pair':
      return rankCounts[hand.rank] >= 2;
    case 'two_pairs':
      return rankCounts[hand.rank1] >= 2 && rankCounts[hand.rank2] >= 2 && hand.rank1 !== hand.rank2;
    case 'triple':
      return rankCounts[hand.rank] >= 3;
    case 'triple_high':
      return rankCounts[hand.rank1] >= 3 && rankCounts[hand.rank2] >= 1 && hand.rank1 !== hand.rank2;
    case 'full_house':
      return rankCounts[hand.rank1] >= 3 && rankCounts[hand.rank2] >= 2 && hand.rank1 !== hand.rank2;
    case 'quadra':
      return rankCounts[hand.rank] >= 4;
    case 'quadra_high':
      return rankCounts[hand.rank1] >= 4 && rankCounts[hand.rank2] >= 1 && hand.rank1 !== hand.rank2;
    default:
      return false;
  }
}

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('createRoom', ({ roomId, playerName }) => {
    // Check if room already exists
    if (rooms.has(roomId)) {
      socket.emit('joinError', { message: 'Room already exists' });
      return;
    }

    const deck = shuffleDeck(createDeck());
    rooms.set(roomId, {
      players: [{ id: socket.id, name: playerName, cards: [] }],
      deck,
      currentTurn: socket.id,
      lastHand: null,
      gameStarted: false
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });

    const room = rooms.get(roomId);
    if (!room.allPlayers) room.allPlayers = [];
    if (!room.allPlayers.find(p => p.id === socket.id)) {
      room.allPlayers.push({ id: socket.id, name: playerName, cardsCount: 0 });
    }
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    
    // Check if room exists
    if (!room) {
      socket.emit('joinError', { message: 'Room does not exist' });
      return;
    }

    // Check if game has started
    if (room.gameStarted) {
      socket.emit('joinError', { message: 'Game has already started' });
      return;
    }

    // Check if room is full
    if (room.players.length >= 6) {
      socket.emit('joinError', { message: 'Room is full' });
      return;
    }

    // Check if player name is already taken
    if (room.players.some(p => p.name === playerName)) {
      socket.emit('joinError', { message: 'Player name already taken' });
      return;
    }

    // Add player to room
    room.players.push({ id: socket.id, name: playerName, cards: [] });
    socket.join(roomId);
    
    // Notify all players in the room
    io.to(roomId).emit('playerJoined', { 
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      roomId
    });

    if (!room.allPlayers) room.allPlayers = [];
    if (!room.allPlayers.find(p => p.id === socket.id)) {
      room.allPlayers.push({ id: socket.id, name: playerName, cardsCount: 0 });
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.players.length >= 3) {
      room.gameStarted = true;
      const hands = dealCards(room.deck, room.players.length);
      room.players.forEach((player, index) => {
        player.cards = hands[index];
      });
      io.to(roomId).emit('gameStarted', {
        players: room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.cards.length })),
        currentTurn: room.currentTurn,
        roomId
      });
      room.players.forEach(player => {
        io.to(player.id).emit('dealCards', { cards: player.cards });
      });

      room.allPlayers.forEach(p => {
        const active = room.players.find(pl => pl.id === p.id);
        p.cardsCount = active ? active.cards.length : 0;
      });
    }
  });

  socket.on('playHand', ({ roomId, hand }) => {
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`[playHand] ERROR: Room not found for roomId: ${roomId}, Player: ${socket.id}`);
    }
    console.log(`[playHand] Player: ${socket.id}, CurrentTurn: ${room ? room.currentTurn : 'N/A'}`);
    if (room && room.currentTurn === socket.id) {
      // Hand strength validation
      if (room.lastHand && room.lastHand.hand) {
        const prevStrength = getHandStrength(room.lastHand.hand);
        const newStrength = getHandStrength(hand);
        if (newStrength <= prevStrength) {
          console.log(`[playHand] Rejected: Hand not stronger. Player: ${socket.id}`);
          socket.emit('joinError', { message: 'You must play a stronger hand than the previous one.' });
          return;
        }
      }
      // Attach playerId to hand for frontend logic
      const handWithPlayer = { ...hand, playerId: socket.id };
      room.lastHand = { playerId: socket.id, hand: handWithPlayer };
      room.lastPlayer = socket.id; // Track last player to play a hand
      room.currentTurn = room.players[(room.players.findIndex(p => p.id === socket.id) + 1) % room.players.length].id;
      console.log(`[playHand] Accepted: NextTurn: ${room.currentTurn}`);
      const allPlayers = room.allPlayers || room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.cards.length }));
      io.to(roomId).emit('handPlayed', {
        playerId: socket.id,
        hand: handWithPlayer,
        nextTurn: room.currentTurn,
        players: allPlayers
      });

      room.allPlayers.forEach(p => {
        const active = room.players.find(pl => pl.id === p.id);
        p.cardsCount = active ? active.cards.length : 0;
      });
    } else if (room) {
      console.log(`[playHand] Rejected: Not your turn. Player: ${socket.id}`);
    }
  });

  socket.on('callBluff', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const callingPlayer = room.players.find(p => p.id === socket.id);
    if (!callingPlayer || callingPlayer.cards.length === 0) {
      socket.emit('joinError', { message: 'You are eliminated and cannot call a bluff.' });
      return;
    }
    if (room.lastHand) {
      const lastPlayer = room.players.find(p => p.id === room.lastHand.playerId);
      if (!lastPlayer || lastPlayer.cards.length === 0) {
        socket.emit('joinError', { message: 'The last player is eliminated. Cannot call bluff.' });
        return;
      }
      // Gather all cards in play
      const allCards = room.players.flatMap(p => p.cards);
      // --- Capture pre-elimination state ---
      const preEliminationPlayers = room.players.map(p => ({ id: p.id, name: p.name, cards: [...p.cards] }));
      // Check if the declared hand exists in the pool
      const handExists = handExistsForBluff(room.lastHand.hand, allCards);
      let loser;
      if (handExists) {
        loser = callingPlayer; // Bluff caller loses if bluff failed
        callingPlayer.cards.pop(); // Remove one card from calling player
      } else {
        loser = lastPlayer; // Last player loses if bluff succeeded
        lastPlayer.cards.pop(); // Remove one card from the player who played the hand
      }
      // Always track the loser for new round starter logic
      room.lastLoser = loser.id;
      // Reveal all cards and show result (use pre-elimination state)
      const bluffResult = handExists ? 'Bluff call failed! The hand was real.' : 'Bluff call successful! The hand was fake.';
      const allPlayersBluff = room.allPlayers || room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.cards.length }));
      io.to(roomId).emit('revealAllCards', {
        players: preEliminationPlayers,
        bluffResult,
        callingPlayer: callingPlayer.id,
        lastPlayer: lastPlayer ? lastPlayer.id : null
      });
      io.to(roomId).emit('bluffResult', {
        handExists,
        callingPlayer: callingPlayer.id,
        lastPlayer: lastPlayer ? lastPlayer.id : null,
        remainingPlayers: room.allPlayers
      });
      // After a delay, start a new round (handled by startNewRound event)
    }
  });

  socket.on('startNewRound', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.roundInProgress) {
        console.log('[startNewRound] Ignored: round already in progress');
        return;
      }
      room.roundInProgress = true;
      // Track loser before filtering
      const prevPlayers = room.players.map(p => ({ ...p }));
      const loserId = room.lastLoser;
      console.log('[startNewRound] loserId:', loserId);
      console.log('[startNewRound] prevPlayers:', prevPlayers.map(p => ({ id: p.id, name: p.name, cards: p.cards.length })));
      // Remove any player with 0 cards
      room.players = room.players.filter(p => p.cards.length > 0);
      // Notify eliminated players
      const eliminatedIds = prevPlayers
        .filter(p => !room.players.find(pl => pl.id === p.id))
        .map(p => p.id);
      eliminatedIds.forEach(id => {
        console.log('[server] Emitting eliminated to:', id);
        io.to(id).emit('eliminated');
      });
      console.log('[startNewRound] filtered players:', room.players.map(p => ({ id: p.id, name: p.name, cards: p.cards.length })));
      // If only one player left, game over
      if (room.players.length === 1) {
        io.to(roomId).emit('gameOver', { winner: room.players[0] });
        rooms.delete(roomId);
        return;
      }
      // Reshuffle and redeal
      room.deck = shuffleDeck(createDeck());
      const hands = dealCards(room.deck, room.players.length);
      room.players.forEach((player, index) => {
        player.cards = hands[index].slice(0, player.cards.length); // Loser has one less card
      });
      // Always start with the player after the loser (in seating order, skipping eliminated)
      let startIdx = 0;
      let chosenId = null;
      if (loserId) {
        const prevIdx = prevPlayers.findIndex(p => p.id === loserId);
        if (prevIdx !== -1 && prevPlayers.length > 1) {
          for (let offset = 1; offset < prevPlayers.length; offset++) {
            const nextIdx = (prevIdx + offset) % prevPlayers.length;
            const nextId = prevPlayers[nextIdx].id;
            const aliveIdx = room.players.findIndex(p => p.id === nextId);
            if (aliveIdx !== -1) {
              startIdx = aliveIdx;
              chosenId = nextId;
              break;
            }
          }
        }
      }
      room.currentTurn = room.players[startIdx].id;
      console.log('[startNewRound] next starter:', room.currentTurn, 'chosenId:', chosenId, 'startIdx:', startIdx);
      room.lastHand = null;
      delete room.lastLoser;
      // Do NOT delete lastPlayer, so it can be used for the next round if no bluff
      delete room.lastWinner;
      // Always include all players (including eliminated) in the gameStarted event
      const allPlayers = prevPlayers.map(p => {
        const stillIn = room.players.find(pl => pl.id === p.id);
        return { id: p.id, name: p.name, cardsCount: stillIn ? stillIn.cards.length : 0 };
      });
      room.allPlayers = allPlayers;
      io.to(roomId).emit('gameStarted', {
        players: room.allPlayers,
        currentTurn: room.currentTurn,
        roomId
      });
      room.players.forEach(player => {
        io.to(player.id).emit('dealCards', { cards: player.cards });
      });
      // Allow new rounds to be started after a short delay
      setTimeout(() => { if (room) room.roundInProgress = false; }, 1000);

      room.allPlayers.forEach(p => {
        const active = room.players.find(pl => pl.id === p.id);
        p.cardsCount = active ? active.cards.length : 0;
      });
    }
  });

  socket.on('skipTurn', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Only allow skip if it's this player's turn and they're not eliminated
    const playerIdx = room.players.findIndex(p => p.id === socket.id);
    if (room.currentTurn !== socket.id || playerIdx === -1) return;
    // Advance to next player
    let nextIdx = (playerIdx + 1) % room.players.length;
    room.currentTurn = room.players[nextIdx].id;
    // Emit a skip event as a handPlayed with no hand
    io.to(roomId).emit('handPlayed', {
      playerId: socket.id,
      hand: { type: 'skip', playerId: socket.id },
      nextTurn: room.currentTurn,
      players: room.allPlayers || room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.cards.length }))
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    // Clean up rooms when players disconnect
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          if (room.allPlayers) {
            room.allPlayers.forEach(p => {
              if (p.id === socket.id) p.cardsCount = 0;
            });
          }
          io.to(roomId).emit('playerLeft', {
            players: room.allPlayers
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 