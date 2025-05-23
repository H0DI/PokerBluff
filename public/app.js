const socket = io();

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const waitingRoom = document.getElementById('waiting-room');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over');
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const startGameBtn = document.getElementById('start-game');
const playHandBtn = document.getElementById('play-hand');
const callBluffBtn = document.getElementById('call-bluff');
const playAgainBtn = document.getElementById('play-again');
const playersList = document.getElementById('players-list');
const playerCardsContainer = document.getElementById('player-cards');
const opponentsContainer = document.getElementById('opponents');
const lastPlay = document.getElementById('last-play');
const currentPlayerSpan = document.getElementById('current-player');

// Game State
let currentRoom = null;
let playerName = '';
let playerCards = [];
let isMyTurn = false;
let hasJoinedRoom = false;
let selectedCard = null;
let selectedHandType = null;
let selectedHandRank = null;
let selectedHandRank2 = null;
let lastDeclaredHand = null;
let lastBluffInfo = null;
const handTypes = [
    { key: 'high_card', label: 'High Card', ranks: 1 },
    { key: 'pair', label: 'Pair', ranks: 1 },
    { key: 'two_pairs', label: 'Two Pairs', ranks: 2 },
    { key: 'triple', label: 'Triple', ranks: 1 },
    { key: 'triple_high', label: 'Triple and a High Card', ranks: 2 },
    { key: 'full_house', label: 'Full House', ranks: 2 },
    { key: 'quadra', label: 'Quadra', ranks: 1 },
    { key: 'quadra_high', label: 'Quadra and a High Card', ranks: 2 }
];
const handRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Track if the player is eliminated
let isEliminated = false;

let turnTimerInterval = null;
let turnTimerTimeout = null;

// Event Listeners
createRoomBtn.addEventListener('click', () => {
    if (hasJoinedRoom) return;
    
    playerName = playerNameInput.value.trim();
    const handSize = parseInt(document.getElementById('setting-hand-size').value, 10) || 5;
    const timerLength = parseInt(document.getElementById('setting-timer').value, 10) || 25;
    if (playerName) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.emit('createRoom', { roomId, playerName, handSize, timerLength });
    } else {
        alert('Please enter your name');
    }
});

joinRoomBtn.addEventListener('click', () => {
    if (hasJoinedRoom) return;
    
    const joinSection = document.getElementById('join-section');
    joinSection.classList.remove('hidden');
    createRoomBtn.disabled = true;
});

document.getElementById('join-game').addEventListener('click', () => {
    if (hasJoinedRoom) return;
    
    playerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    if (playerName && roomId) {
        socket.emit('joinRoom', { roomId, playerName });
    } else {
        alert('Please enter both your name and room ID');
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', { roomId: currentRoom });
});

playHandBtn.addEventListener('click', () => {
    playHandSound();
    const typeObj = handTypes.find(t => t.key === selectedHandType);
    if (!typeObj) return;
    if (typeObj.ranks === 1 && isMyTurn && selectedHandType && selectedHandRank) {
        socket.emit('playHand', {
            roomId: currentRoom,
            hand: { type: selectedHandType, rank: selectedHandRank }
        });
    } else if (typeObj.ranks === 2 && isMyTurn && selectedHandType && selectedHandRank && selectedHandRank2 && selectedHandRank !== selectedHandRank2) {
        socket.emit('playHand', {
            roomId: currentRoom,
            hand: { type: selectedHandType, rank1: selectedHandRank, rank2: selectedHandRank2 }
        });
    }
});

callBluffBtn.addEventListener('click', () => {
    playBluffSound();
    socket.emit('callBluff', { roomId: currentRoom });
});

playAgainBtn.addEventListener('click', () => {
    location.reload();
});

// Socket Event Handlers
socket.on('roomCreated', ({ roomId, handSize, timerLength }) => {
    currentRoom = roomId;
    hasJoinedRoom = true;
    document.getElementById('room-id-display').textContent = roomId;
    // Show settings in waiting room
    document.getElementById('waiting-room-settings').innerHTML = `Hand Size: <b>${handSize}</b> &nbsp;|&nbsp; Turn Timer: <b>${timerLength}s</b>`;
    showScreen(waitingRoom);
});

socket.on('joinError', ({ message }) => {
    alert(message);
    hasJoinedRoom = false;
    if (isMyTurn) {
        showHandSelection();
    }
});

socket.on('playerJoined', ({ players, roomId, handSize, timerLength }) => {
    hasJoinedRoom = true;
    if (roomId) currentRoom = roomId;
    document.getElementById('room-id-display').textContent = currentRoom;
    updatePlayersList(players, document.getElementById('waiting-players-list'));
    document.getElementById('player-count').textContent = players.length;
    // Show settings in waiting room
    if (handSize && timerLength) {
        document.getElementById('waiting-room-settings').innerHTML = `Hand Size: <b>${handSize}</b> &nbsp;|&nbsp; Turn Timer: <b>${timerLength}s</b>`;
    }
    startGameBtn.disabled = players.length < 3;
    showScreen(waitingRoom);
});

socket.on('gameStarted', ({ players, currentTurn, roomId }) => {
    if (roomId) currentRoom = roomId;
    showScreen(gameScreen);
    updatePlayersList(players, document.getElementById('game-players-list'));
    updateTurnIndicator(currentTurn);
    isMyTurn = socket.id === currentTurn;
    console.log('[gameStarted] My socket.id:', socket.id, 'currentTurn:', currentTurn, 'isMyTurn:', isMyTurn);
    // Always clear last claimed hand and reset lastDeclaredHand at the start of a new round
    lastDeclaredHand = null;
    lastPlay.classList.add('hidden');
    lastPlay.innerHTML = '';
    updateButtonStates();
    stopTurnTimer();
    startTurnTimer(isMyTurn);
    if (isMyTurn) {
        selectedHandType = null;
        selectedHandRank = null;
        selectedHandRank2 = null;
        showHandSelection();
    } else {
        const handSelection = document.querySelector('.hand-selection');
        if (handSelection) handSelection.remove();
    }
});

socket.on('dealCards', ({ cards }) => {
    playerCards = cards;
    isEliminated = playerCards.length === 0;
    renderPlayerCards(true);
    updateButtonStates();
    // Remove any previous eliminated message
    const oldOverlay = document.getElementById('eliminated-overlay');
    if (oldOverlay) oldOverlay.remove();
    if (isEliminated) {
        // Hide hand selection if present
        const handSelection = document.querySelector('.hand-selection');
        if (handSelection) handSelection.remove();
        // Show a full-screen overlay
        let overlay = document.createElement('div');
        overlay.id = 'eliminated-overlay';
        overlay.className = 'eliminated-overlay';
        overlay.innerHTML = '<div class="eliminated-overlay-content">You have been <span>eliminated</span>!</div>';
        document.body.appendChild(overlay);
    }
});

socket.on('handPlayed', ({ playerId, hand, nextTurn, players }) => {
    if (hand && hand.type === 'skip') {
        // Only update turn and show skip message, do not update lastDeclaredHand or claimed hand
        updatePlayersList(players, document.getElementById('game-players-list'));
        updateTurnIndicator(nextTurn);
        isMyTurn = socket.id === nextTurn;
        console.log('[handPlayed] SKIP: My socket.id:', socket.id, 'nextTurn:', nextTurn, 'isMyTurn:', isMyTurn);
        stopTurnTimer();
        startTurnTimer(isMyTurn);
        // Show skip message below the last claimed hand
        const player = document.querySelector(`.player-item[data-id="${playerId}"]`);
        const playerName = player ? player.querySelector('span').textContent : 'Unknown';
        lastPlay.classList.remove('hidden');
        // Only update the play-info, not the cards
        let playInfo = lastPlay.querySelector('.play-info');
        if (!playInfo) {
            playInfo = document.createElement('div');
            playInfo.className = 'play-info';
            lastPlay.appendChild(playInfo);
        }
        playInfo.textContent = `${playerName} was skipped.`;
        // Always remove hand selection for the skipped player
        const handSelection = document.querySelector('.hand-selection');
        if (handSelection) handSelection.remove();
        // If I am the next player, show hand selection
        if (isMyTurn) showHandSelection();
        updateButtonStates();
        return;
    }
    // Normal hand played
    lastDeclaredHand = hand;
    updateLastPlay(playerId, hand);
    updatePlayersList(players, document.getElementById('game-players-list'));
    updateTurnIndicator(nextTurn);
    isMyTurn = socket.id === nextTurn;
    console.log('[handPlayed] My socket.id:', socket.id, 'nextTurn:', nextTurn, 'isMyTurn:', isMyTurn);
    stopTurnTimer();
    startTurnTimer(isMyTurn);
    if (isMyTurn) {
        selectedHandType = null;
        selectedHandRank = null;
        selectedHandRank2 = null;
        showHandSelection();
    } else {
        const handSelection = document.querySelector('.hand-selection');
        if (handSelection) handSelection.remove();
    }
    updateButtonStates();
});

socket.on('bluffResult', ({ handExists, callingPlayer, lastPlayer, remainingPlayers }) => {
    lastBluffInfo = { handExists, callingPlayer, lastPlayer, remainingPlayers };
    const resultMessage = handExists ? 
        'Bluff call failed! The hand was real.' : 
        'Bluff call successful! The hand was fake.';
    showBluffResult(resultMessage);
    updatePlayersList(remainingPlayers, document.getElementById('game-players-list'));
    stopTurnTimer();
    setTimeout(() => {
        const nextPlayer = remainingPlayers.find(p => p.cardsCount > 0);
        if (nextPlayer) {
            updateTurnIndicator(nextPlayer.id);
            isMyTurn = socket.id === nextPlayer.id;
            updateButtonStates();
            stopTurnTimer();
            startTurnTimer(isMyTurn);
        }
    }, 2000);
});

socket.on('gameOver', ({ winner }) => {
    showScreen(gameOverScreen);
    document.querySelector('.winner-announcement').textContent = 
        `Winner: ${winner.name}!`;
    stopTurnTimer();
});

socket.on('playerLeft', ({ players }) => {
    updatePlayersList(players, document.getElementById('game-players-list'));
    document.getElementById('player-count').textContent = players.length;
});

// Enhanced revealAllCards overlay
socket.on('revealAllCards', ({ players, bluffResult, callingPlayer, lastPlayer }) => {
    // Find bluff info if available
    let callerName = '', calledName = '';
    if (callingPlayer && lastPlayer) {
        const caller = players.find(p => p.id === callingPlayer);
        const called = players.find(p => p.id === lastPlayer);
        callerName = caller ? caller.name : '';
        calledName = called ? called.name : '';
    }
    let revealDiv = document.createElement('div');
    revealDiv.className = 'reveal-cards-modal';
    revealDiv.innerHTML = `
        <div class='reveal-cards-content'>
            <h2>All Cards Revealed</h2>
            <div class='bluff-players-row'><b class='bluff-caller-highlight'>${callerName}</b> called bluff on <b>${calledName}</b></div>
            <div class='reveal-cards-list'>
                ${players.map(p => `<div class='reveal-player-row'><span class='reveal-player-name'>${p.name}:</span> <span class='reveal-player-cards'>${p.cards.map(card => card.value + card.suit).join(' ')}</span></div>`).join('')}
            </div>
            <div class='bluff-result-msg ${bluffResult.includes('successful') ? 'bluff-success' : 'bluff-fail'}'>${bluffResult}</div>
        </div>
    `;
    document.body.appendChild(revealDiv);
    // Hide the claimed hand area after round ends
    lastPlay.classList.add('hidden');
    setTimeout(() => {
        if (document.body.contains(revealDiv)) {
            revealDiv.remove();
            socket.emit('startNewRound', { roomId: currentRoom });
        }
    }, 5300);
    stopTurnTimer();
});

// Add a handler to clear UI and reset for new round
// (ensure updateButtonStates is called)
document.addEventListener('newRound', () => {
    lastDeclaredHand = null;
    selectedHandType = null;
    selectedHandRank = null;
    selectedHandRank2 = null;
    renderPlayerCards(true);
    updateButtonStates();
    // Also hide the claimed hand area at the start of a new round
    lastPlay.classList.add('hidden');
    if (isMyTurn) showHandSelection();
});

socket.on('eliminated', () => {
    console.log('[eliminated event] Fired');
    isEliminated = true;
    // Remove any previous overlay
    const oldOverlay = document.getElementById('eliminated-overlay');
    if (oldOverlay) oldOverlay.remove();
    // Hide hand selection if present
    const handSelection = document.querySelector('.hand-selection');
    if (handSelection) handSelection.remove();
    // Hide the entire player-area (cards and controls)
    const playerArea = document.querySelector('.player-area');
    if (playerArea) playerArea.style.display = 'none';
    console.log('[eliminated event] Adding eliminated class to body');
    // Add eliminated class to body for extra styling
    document.body.classList.add('eliminated');
    // Disable all action buttons and add disabled class
    playHandBtn.disabled = true;
    callBluffBtn.disabled = true;
    playHandBtn.classList.add('disabled');
    callBluffBtn.classList.add('disabled');
    // Show a full-screen overlay with a Watch Game button
    let overlay = document.createElement('div');
    overlay.id = 'eliminated-overlay';
    overlay.className = 'eliminated-overlay';
    overlay.innerHTML = '<div class="eliminated-overlay-content">You have been <span>eliminated</span>!<br><button id="watch-game-btn" class="watch-game-btn">Watch Game</button></div>';
    document.body.appendChild(overlay);
    // Add event listener to dismiss overlay
    document.getElementById('watch-game-btn').addEventListener('click', () => {
        overlay.remove();
    });
    updateButtonStates();
    stopTurnTimer();
});

// Helper Functions
function showScreen(screen) {
    [welcomeScreen, waitingRoom, gameScreen, gameOverScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}

function updatePlayersList(players, targetList) {
    // Calculate total cards on table
    const totalCards = players.reduce((sum, p) => sum + (p.cardsCount || 0), 0);
    // If in the collapsible, update the always-visible element
    const totalCardsElem = document.getElementById('total-cards-always-visible');
    if (totalCardsElem) totalCardsElem.textContent = `Total cards on table: ${totalCards}`;
    let html = '';
    html += players.map(player => `
        <div class="player-item${player.cardsCount === 0 ? ' eliminated-player' : ''}" data-id="${player.id}">
            <span>${player.name}
                ${player.cardsCount === 0 ? '<span class="elim-badge">Eliminated</span>' : ''}
            </span>
            <span>Cards: ${player.cardsCount === undefined ? '?' : player.cardsCount}</span>
        </div>
    `).join('');
    targetList.innerHTML = html;
}

function renderPlayerCards(isInitialDeal = false) {
    playerCardsContainer.innerHTML = playerCards.map((card, index) => `
        <div class="card ${['♥', '♦'].includes(card.suit) ? 'red' : 'black'}${isInitialDeal ? ' dealt' : ''}"
             style="animation-delay: ${isInitialDeal ? index * 0.12 : 0}s"
             data-index="${index}">
            ${card.value}${card.suit}
        </div>
    `).join('');
    // No click event listeners, cards are now static
}

function formatHand(hand) {
    if (!hand || typeof hand !== 'object') return '';
    // Map type keys to readable labels
    const typeMap = {
        high_card: 'High Card',
        pair: 'Pair',
        two_pairs: 'Two Pairs',
        triple: 'Triple',
        triple_high: 'Triple and a High Card',
        full_house: 'Full House',
        quadra: 'Quadra',
        quadra_high: 'Quadra and a High Card'
    };
    if (hand.type && typeMap[hand.type]) {
        if (hand.rank && !hand.rank1) {
            return `${typeMap[hand.type]}: ${hand.rank}`;
        } else if (hand.rank1 && hand.rank2) {
            return `${typeMap[hand.type]}: ${hand.rank1} & ${hand.rank2}`;
        }
        return typeMap[hand.type];
    }
    return '';
}

function visualizeHandCards(hand) {
    if (!hand || typeof hand !== 'object') return '';
    // Helper to get card HTML with color
    const cardHtml = (rank, suit = '♠') => {
        const isRed = suit === '♥' || suit === '♦';
        return `<div class='card visualized' style='color:${isRed ? '#e74c3c' : '#222'}'>${rank}${suit}</div>`;
    };
    let cards = [];
    const suit = '♠';
    if (hand.type === 'high_card' && hand.rank) {
        cards = [[hand.rank, suit]];
    }
    if (hand.type === 'pair' && hand.rank) {
        cards = [[hand.rank, suit], [hand.rank, suit]];
    }
    if (hand.type === 'two_pairs' && hand.rank1 && hand.rank2) {
        cards = [[hand.rank1, suit], [hand.rank1, suit], [hand.rank2, suit], [hand.rank2, suit]];
    }
    if (hand.type === 'triple' && hand.rank) {
        cards = [[hand.rank, suit], [hand.rank, suit], [hand.rank, suit]];
    }
    if (hand.type === 'triple_high' && hand.rank1 && hand.rank2) {
        cards = [[hand.rank1, suit], [hand.rank1, suit], [hand.rank1, suit], [hand.rank2, suit]];
    }
    if (hand.type === 'full_house' && hand.rank1 && hand.rank2) {
        cards = [[hand.rank1, suit], [hand.rank1, suit], [hand.rank1, suit], [hand.rank2, suit], [hand.rank2, suit]];
    }
    if (hand.type === 'quadra' && hand.rank) {
        cards = [[hand.rank, suit], [hand.rank, suit], [hand.rank, suit], [hand.rank, suit]];
    }
    if (hand.type === 'quadra_high' && hand.rank1 && hand.rank2) {
        cards = [[hand.rank1, suit], [hand.rank1, suit], [hand.rank1, suit], [hand.rank1, suit], [hand.rank2, suit]];
    }
    // Render as a horizontal row of card divs
    return `<div class='claimed-cards-container'>${cards.map(([r, s]) => cardHtml(r, s)).join('')}</div>`;
}

function updateLastPlay(playerId, hand) {
    const player = document.querySelector(`.player-item[data-id="${playerId}"]`);
    const playerName = player ? player.querySelector('span').textContent : 'Unknown';
    lastPlay.classList.remove('hidden');
    // Clear and set the claimed hand container
    lastPlay.innerHTML = `
        ${visualizeHandCards(hand)}
        <div class="play-info">${playerName} claimed:</div>
    `;
    // Add animation class
    lastPlay.classList.add('bluff-called');
    setTimeout(() => lastPlay.classList.remove('bluff-called'), 500);
}

function updateTurnIndicator(playerId) {
    const player = document.querySelector(`.player-item[data-id="${playerId}"]`);
    const playerName = player ? player.querySelector('span').textContent : 'Unknown';
    currentPlayerSpan.textContent = playerName;
}

function updateButtonStates() {
    const typeObj = handTypes.find(t => t.key === selectedHandType);
    if (isEliminated) {
        playHandBtn.disabled = true;
        callBluffBtn.disabled = true;
        return;
    }
    if (!typeObj) {
        playHandBtn.disabled = true;
    } else if (typeObj.ranks === 1) {
        playHandBtn.disabled = !(isMyTurn && selectedHandType && selectedHandRank);
    } else if (typeObj.ranks === 2) {
        playHandBtn.disabled = !(isMyTurn && selectedHandType && selectedHandRank && selectedHandRank2 && selectedHandRank !== selectedHandRank2);
    }
    // Disable Call Bluff if there is no hand to bluff or you were the last to declare a hand
    const lastPlayerId = lastDeclaredHand && lastDeclaredHand.playerId;
    callBluffBtn.disabled = !lastDeclaredHand || lastPlayerId === socket.id;
}

function showBluffResult(message) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'bluff-result';
    resultDiv.textContent = message;
    document.querySelector('.center-area').appendChild(resultDiv);
    
    setTimeout(() => resultDiv.remove(), 3000);
}

function showHandSelection() {
    // Remove any existing hand selection UI
    const old = document.querySelector('.hand-selection');
    if (old) old.remove();

    const handSelectionDiv = document.createElement('div');
    handSelectionDiv.className = 'hand-selection';
    // Compute last hand strength
    const lastStrength = lastDeclaredHand ? getHandStrength(lastDeclaredHand) : -1;
    handSelectionDiv.innerHTML = `
        <h3>Select a Hand to Declare</h3>
        <div class="hand-type-group" style="${selectedHandType ? 'display:none;' : ''}">
            ${handTypes.map(type => {
                // For each type, check if any possible rank(s) would be valid
                let canBeStronger = false;
                if (!lastDeclaredHand) canBeStronger = true;
                else {
                    if (type.ranks === 1) {
                        canBeStronger = handRanks.some(rank => getHandStrength({ type: type.key, rank }) > lastStrength);
                    } else if (type.ranks === 2) {
                        canBeStronger = handRanks.some(rank1 => handRanks.some(rank2 => rank1 !== rank2 && getHandStrength({ type: type.key, rank1, rank2 }) > lastStrength));
                    }
                }
                return `<button class="hand-type-option${selectedHandType === type.key ? ' selected' : ''}" data-type="${type.key}" ${canBeStronger ? '' : 'disabled style=\'opacity:0.5;cursor:not-allowed;\''}>${type.label}</button>`;
            }).join('')}
        </div>
        <div class="hand-rank-group" style="${selectedHandType ? '' : 'display:none;'}">
            ${(() => {
                const typeObj = handTypes.find(t => t.key === selectedHandType);
                if (!typeObj) return '';
                let html = '';
                if (typeObj.ranks === 1) {
                    html += `<div class='rank-select-grid'>` +
                        handRanks.map(rank => {
                            const isStronger = getHandStrength({ type: typeObj.key, rank }) > lastStrength;
                            return `<button class="hand-rank-option${selectedHandRank === rank ? ' selected' : ''}" data-rank="${rank}" ${isStronger ? '' : 'disabled style=\'opacity:0.5;cursor:not-allowed;\''}>${rank}</button>`;
                        }).join('') + `</div>`;
                } else if (typeObj.ranks === 2) {
                    html += `<div class='rank-select-grid'>` +
                        handRanks.map(rank => {
                            const isStronger = handRanks.some(rank2 => rank2 !== rank && getHandStrength({ type: typeObj.key, rank1: rank, rank2 }) > lastStrength);
                            return `<button class="hand-rank-option${selectedHandRank === rank ? ' selected' : ''}" data-rank="${rank}" data-ranknum="1" ${isStronger ? '' : 'disabled style=\'opacity:0.5;cursor:not-allowed;\''}>${rank}</button>`;
                        }).join('') + `</div>` +
                        `<div class='rank-select-grid'>` +
                        handRanks.map(rank => {
                            const isStronger = handRanks.some(rank1 => rank1 !== rank && getHandStrength({ type: typeObj.key, rank1, rank2: rank }) > lastStrength);
                            return `<button class="hand-rank2-option${selectedHandRank2 === rank ? ' selected' : ''}" data-rank="${rank}" data-ranknum="2" ${isStronger ? '' : 'disabled style=\'opacity:0.5;cursor:not-allowed;\''}>${rank}</button>`;
                        }).join('') + `</div>`;
                }
                html += `<div style='margin-top:1rem;'><button class='back-to-type'>Back</button></div>`;
                return html;
            })()}
        </div>
    `;
    // Add event listeners for type
    handSelectionDiv.querySelectorAll('.hand-type-option').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            selectedHandType = btn.dataset.type;
            selectedHandRank = null;
            selectedHandRank2 = null;
            showHandSelection(); // re-render for selection highlight
            updatePlayHandBtnState();
        });
    });
    // Add event listeners for rank 1
    handSelectionDiv.querySelectorAll('.hand-rank-option').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            selectedHandRank = btn.dataset.rank;
            showHandSelection(); // re-render for selection highlight
            updatePlayHandBtnState();
        });
    });
    // Add event listeners for rank 2
    handSelectionDiv.querySelectorAll('.hand-rank2-option').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            selectedHandRank2 = btn.dataset.rank;
            showHandSelection(); // re-render for selection highlight
            updatePlayHandBtnState();
        });
    });
    // Back button
    const backBtn = handSelectionDiv.querySelector('.back-to-type');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            selectedHandType = null;
            selectedHandRank = null;
            selectedHandRank2 = null;
            showHandSelection();
            updatePlayHandBtnState();
        });
    }
    document.querySelector('.center-area').appendChild(handSelectionDiv);
}

function updatePlayHandBtnState() {
    const typeObj = handTypes.find(t => t.key === selectedHandType);
    if (!typeObj) {
        playHandBtn.disabled = true;
        return;
    }
    if (typeObj.ranks === 1) {
        playHandBtn.disabled = !(isMyTurn && selectedHandType && selectedHandRank);
    } else if (typeObj.ranks === 2) {
        playHandBtn.disabled = !(isMyTurn && selectedHandType && selectedHandRank && selectedHandRank2 && selectedHandRank !== selectedHandRank2);
    }
}

// Helper: get hand strength (same as backend)
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

function playHandSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.value = 0.13;
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime + i * 0.07);
            o.stop(ctx.currentTime + i * 0.07 + 0.18);
        });
        setTimeout(() => ctx.close(), 350);
    } catch (e) {}
}

function playBluffSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const freqs = [392, 523.25, 659.25]; // G4, C5, E5 (a major chord)
        freqs.forEach((freq) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = freq;
            g.gain.value = 0.11;
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime);
            o.stop(ctx.currentTime + 0.22);
        });
        setTimeout(() => ctx.close(), 250);
    } catch (e) {}
}

function playWarningSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 1046.5; // C6, clear beep
        g.gain.value = 0.18;
        o.connect(g).connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 120);
    } catch (e) {}
}

function startTurnTimer(isMyTurn) {
    const timerDiv = document.getElementById('turn-timer');
    if (!timerDiv) return;
    let timeLeft = 25;
    timerDiv.textContent = `${timeLeft}s`;
    timerDiv.className = 'turn-timer';
    timerDiv.classList.remove('hidden');
    clearInterval(turnTimerInterval);
    clearTimeout(turnTimerTimeout);
    if (!isMyTurn) {
        timerDiv.classList.add('hidden');
        return;
    }
    turnTimerInterval = setInterval(() => {
        timeLeft--;
        timerDiv.textContent = `${timeLeft}s`;
        timerDiv.className = 'turn-timer';
        if (timeLeft <= 5 && timeLeft > 2) {
            timerDiv.classList.add('warning');
            playWarningSound();
            if (navigator.vibrate) navigator.vibrate(80);
        }
        if (timeLeft <= 2 && timeLeft > 0) {
            timerDiv.classList.add('critical');
            playWarningSound();
            if (navigator.vibrate) navigator.vibrate([120, 40, 120]);
        }
        if (timeLeft <= 0) {
            clearInterval(turnTimerInterval);
            timerDiv.textContent = '0s';
            timerDiv.className = 'turn-timer critical';
        }
    }, 1000);
    turnTimerTimeout = setTimeout(() => {
        clearInterval(turnTimerInterval);
        timerDiv.textContent = '0s';
        timerDiv.className = 'turn-timer critical';
        // Auto-skip turn
        socket.emit('skipTurn', { roomId: currentRoom });
    }, 25000);
}

function stopTurnTimer() {
    clearInterval(turnTimerInterval);
    clearTimeout(turnTimerTimeout);
    const timerDiv = document.getElementById('turn-timer');
    if (timerDiv) timerDiv.classList.add('hidden');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-players-list');
    const content = document.getElementById('players-list-section');
    // Add total cards always visible
    let totalCardsElem = document.getElementById('total-cards-always-visible');
    if (!totalCardsElem && toggleBtn) {
        totalCardsElem = document.createElement('span');
        totalCardsElem.id = 'total-cards-always-visible';
        totalCardsElem.className = 'total-cards-always-visible';
        toggleBtn.parentNode.insertBefore(totalCardsElem, toggleBtn.nextSibling);
    }
    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = content.classList.contains('hidden');
            if (isHidden) {
                content.classList.remove('hidden');
                toggleBtn.setAttribute('aria-expanded', 'true');
                toggleBtn.innerHTML = 'Hide Players ▲';
            } else {
                content.classList.add('hidden');
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.innerHTML = 'Show Players ▼';
            }
        });
    }
    // Logo flip logic
    const logo3d = document.querySelector('.logo-flip-3d');
    const logoMsg = document.getElementById('logo-flip-message');
    if (logo3d && logoMsg) {
        let flipped = false;
        function doFlip() {
            flipped = !flipped;
            if (flipped) {
                logo3d.classList.add('flipped');
                logoMsg.classList.remove('hidden');
                logoMsg.classList.add('visible');
                setTimeout(() => {
                    logo3d.classList.remove('flipped');
                    logoMsg.classList.remove('visible');
                    logoMsg.classList.add('hidden');
                    flipped = false;
                }, 2000);
            } else {
                logo3d.classList.remove('flipped');
                logoMsg.classList.remove('visible');
                logoMsg.classList.add('hidden');
            }
        }
        logo3d.addEventListener('click', doFlip);
        logo3d.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') doFlip();
        });
    }
}); 