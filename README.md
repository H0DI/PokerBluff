<p align="center">
  <img src="assets/poker-chip.svg" width="120" alt="Poker Bluff Icon"/>
</p>

<h1 align="center">🃏 Poker Bluff</h1>
<p align="center">
  <b>A real-time multiplayer web-based card game for bluffers and strategists!</b>
</p>

---

## 🎮 Screenshots

<p align="center">
  <img src="assets/screenshot-game.png" width="400" alt="Game Screen"/>
  <img src="assets/screenshot-eliminated.png" width="400" alt="Eliminated Screen"/>
</p>

---

## 🚀 Features

- Real-time multiplayer gameplay (Node.js, Express, Socket.IO)
- Mobile-first, modern UI (optimized for phones and desktop)
- Poker hand declaration with bluffing and hand strength logic (including kickers)
- Call bluff mechanic with dramatic reveal overlays and color-coded results
- Player elimination with full-screen overlays and spectate mode
- Custom room settings: hand size and turn timer (set by host)
- Animated card dealing and bluff reveal
- Melodic sound effects for actions and timer warnings (Web Audio API)
- Collapsible player list
- Always-visible total card count and claimed hand display
- Turn timer with warning sounds, color changes, and device vibration
- Robust backend logic for turn order, elimination, and hand comparison
---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **Frontend:** HTML, CSS (Poppins font), JavaScript

---

## 📝 How to Play

### Game Objective
Be the last player with cards remaining by out-bluffing and outsmarting your opponents!

### Setup
- Join or create a room. The host sets the hand size and turn timer.
- Each player is dealt a hand of cards (face down to others).

### Turn Flow
1. **Declare a Hand:** On your turn, select cards and declare a poker hand (e.g., Pair, Two Pair, Straight, etc.). You may bluff and claim a stronger hand than you actually have.
2. **Next Player:** The next player (clockwise) must declare a hand of equal or greater strength, or call bluff.
3. **Calling Bluff:** Any player (on their turn) can call bluff instead of declaring a hand.

### Bluff Resolution
- If a bluff is called, all cards are revealed:
  - **If the claimed hand exists:** The caller loses a card.
  - **If the claim was a bluff:** The claimer loses a card.
- The next round starts with the player after the loser (skipping eliminated players).

### Elimination & Victory
- Players with 0 cards are eliminated and cannot play or call bluff (they can spectate).
- The last player with cards wins the game!

### Additional Rules
- Hands must always increase in strength (or match the previous hand's strength with higher kickers).
- All hand types and comparisons follow standard poker rules (with robust kicker logic).
- The turn timer enforces play speed; if time runs out, the player is skipped.
- Eliminated players are visually marked and cannot interact.

---

## 🖥️ Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/poker-bluff.git
cd poker-bluff
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
