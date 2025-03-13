const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database'); // Ensure this is correctly set up

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// Serve static files from client's build directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, '../client/public/assets')));

// Root route handler
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// API Routes
app.get('/api/user/:id/balance', async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if user exists, if not create a new user
        let balance;
        try {
            balance = await db.getUserBalance(id);
        } catch (error) {
            if (error.message === 'User not found') {
                // Create a new user with default balance
                await db.db.run('INSERT INTO users (id, username, balance) VALUES (?, ?, ?)', [id, `User${id}`, 10000]);
                balance = 10000;
            } else {
                throw error;
            }
        }
        
        res.status(200).json({ balance });
    } catch (error) {
        console.error('Error fetching/creating balance:', error.message);
        res.status(500).json({ error: 'Failed to fetch/create balance' });
    }
});


// Helper function to generate random symbols
const SYMBOLS = {
    "7": { value: '7', payout: 20, type: 'regular', weight: 1 },
    "8": { value: '8', payout: 20, type: 'regular', weight: 1 },
    "9": { value: '9', payout: 20, type: 'regular', weight: 1 },
    "J": { value: 'jack', payout: 30, type: 'regular', weight: 1 },
    "Q": { value: 'queen', payout: 30, type: 'regular', weight: 1 },
    "K": { value: 'king', payout: 40, type: 'regular', weight: 1 },
    "A": { value: 'ace', payout: 50, type: 'regular', weight: 1 },
    "big_joker": { value: 'big_joker', payout: 0, type: 'wild', weight: 1 },
    "small_joker": { value: 'small_joker', payout: 0, type: 'wild', weight: 1 },
    "wild": { value: 'wild', payout: 0, type: 'wild', weight: 1 },
    "scatter": { value: 'scatter', payout: 0, type: 'scatter', weight: 1 },
    GOLD: { value: 'GOLD', payout: 100, type: 'regular', weight: 1 },
    DIAMOND: { value: 'DIAMOND', payout: 80, type: 'regular', weight: 2 },
    CLUB: { value: 'CLUB', payout: 60, type: 'regular', weight: 3 },
    HEART: { value: 'HEART', payout: 50, type: 'regular', weight: 4 },
    SPADE: { value: 'SPADE', payout: 40, type: 'regular', weight: 5 },
    SMALL_JOKER: { value: 'SMALL_JOKER', payout: 0, type: 'wild', weight: 2 },
    BIG_JOKER: { value: 'BIG_JOKER', payout: 0, type: 'wild', weight: 1 }
};

function generateSymbols() {
    const regularSymbols = Object.values(SYMBOLS).filter(s => s.type === 'regular');
    const grid = Array(6).fill().map(() => Array(6).fill(null));

    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
            const totalWeight = regularSymbols.reduce((sum, symbol) => sum + symbol.weight, 0);
            let random = Math.random() * totalWeight;
            let selectedSymbol = null;

            for (const symbol of regularSymbols) {
                random -= symbol.weight;
                if (random <= 0) {
                    selectedSymbol = symbol;
                    break;
                }
            }

            const isGolden = col >= 1 && col <= 4 && Math.random() < 0.15;
            grid[row][col] = {
                type: selectedSymbol.value,
                isGolden: isGolden,
                jokerType: null,
                jokerSize: 0
            };
        }
    }

    // Implement 80% win rate logic
    if (Math.random() < 0.8) {
        const winningSymbol = regularSymbols[Math.floor(Math.random() * regularSymbols.length)];
        const randomColumn = Math.floor(Math.random() * 6);
        for (let row = 0; row < 6; row++) {
            grid[row][randomColumn] = {
                type: winningSymbol.value,
                isGolden: randomColumn >= 1 && randomColumn <= 4 && Math.random() < 0.15,
                jokerType: null,
                jokerSize: 0
            };
        }
    }

    return grid;
}

// Update calculateWinnings to use SYMBOLS
function calculateWinnings(grid) {
    let totalWinnings = 0;
    const winningLines = [];

    // Calculate winnings for columns
    for (let col = 0; col < 6; col++) {
        const symbolsInColumn = grid.map(row => row[col]);
        const regularSymbols = symbolsInColumn.filter(s => 
            SYMBOLS[s.type] && SYMBOLS[s.type].type === 'regular'
        );
        const wildSymbols = symbolsInColumn.filter(s => 
            SYMBOLS[s.type] && SYMBOLS[s.type].type === 'wild'
        );

        // Win if all symbols are the same or if there's a combination with wilds
        if (regularSymbols.length + wildSymbols.length === 6) {
            const baseSymbol = regularSymbols[0] || symbolsInColumn[0];
            if (baseSymbol && SYMBOLS[baseSymbol.type]) {
                totalWinnings += SYMBOLS[baseSymbol.type].payout;
                winningLines.push({ line: col + 6, symbol: baseSymbol.type });
            }
        }
    }

    // Check rows for winning lines
    for (let row = 0; row < 6; row++) {
        const rowSymbols = grid[row];
        const regularSymbols = rowSymbols.filter(s => 
            SYMBOLS[s.type] && SYMBOLS[s.type].type === 'regular'
        );
        const wildSymbols = rowSymbols.filter(s => 
            SYMBOLS[s.type] && SYMBOLS[s.type].type === 'wild'
        );

        // Win if all symbols are the same or if there's a combination with wilds
        if (regularSymbols.length + wildSymbols.length === 6) {
            const baseSymbol = regularSymbols[0] || rowSymbols[0];
            if (baseSymbol && SYMBOLS[baseSymbol.type]) {
                totalWinnings += SYMBOLS[baseSymbol.type].payout;
                winningLines.push({ line: row, symbol: baseSymbol.type });
            }
        }
    }

    return {
        winAmount: totalWinnings,
        winningLines
    };
}

// Calculate multiplier based on winning lines
function calculateMultiplier(winningLines) {
    if (winningLines.length >= 5) return 10;
    if (winningLines.length >= 4) return 8;
    if (winningLines.length >= 3) return 6;
    if (winningLines.length >= 2) return 4;
    if (winningLines.length >= 1) return 2;
    return 1;
}

// API Routes
app.post('/user', async (req, res) => {
    try {
        const { username } = req.body;
        // Ensure database operations are correct
        const user = await db.createUser(username);
        if (!user) {
            throw new Error('User creation failed');
        }
        res.status(201).json(user);
    } catch (error) {
        console.error('Error creating user:', error.message);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.get('/api/user/:id/balance', async (req, res) => {
    try {
        const { id } = req.params;
        
        // First check if user exists, if not create a new user
        let balance;
        try {
            balance = await db.getUserBalance(id);
        } catch (error) {
            if (error.message === 'User not found') {
                // Create a new user with default balance
                await db.db.run('INSERT INTO users (id, username, balance) VALUES (?, ?, ?)', [id, `User${id}`, 10000]);
                balance = 10000;
            } else {
                throw error;
            }
        }
        
        res.status(200).json({ balance });
    } catch (error) {
        console.error('Error fetching/creating balance:', error.message);
        res.status(500).json({ error: 'Failed to fetch/create balance' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Add the missing bet route
    app.post('/api/user/:userId/bet', async (req, res) => {
        try {
            const { userId } = req.params;
            const { betAmount, extraBet } = req.body;
            
            // Generate initial grid
            const grid = generateSymbols();
            let { winAmount, winningLines } = calculateWinnings(grid);
            
            // Handle golden symbol transformations
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < 6; col++) {
                    if (grid[row][col].isGolden && winningLines.some(line => 
                        (line.line < 6 && line.line === row) || 
                        (line.line >= 6 && line.line - 6 === col)
                    )) {
                        grid[row][col] = {
                            type: 'SMALL_JOKER',
                            jokerType: 'small',
                            jokerSize: 1,
                            isGolden: false
                        };
                    }
                }
            }
            
            // Recalculate winnings after transformations
            const finalResults = calculateWinnings(grid);
            winAmount = finalResults.winAmount;
            winningLines = finalResults.winningLines;
            
            // Calculate multiplier
            const multiplier = extraBet ? Math.min(10, 2 + winningLines.length) : Math.min(5, 1 + winningLines.length);
            const totalWin = winAmount * multiplier;
    
            // Update user balance in database
            const newBalance = await db.updateUserBalance(userId, -betAmount + totalWin);
    
            res.json({
                grid,
                newBalance,
                winAmount: totalWin,
                multiplier,
                winningLines
            });
        } catch (error) {
            console.error('Bet processing failed:', error);
            res.status(500).json({ error: 'Failed to process bet' });
        }
    });