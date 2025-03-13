const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'game.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        balance INTEGER NOT NULL DEFAULT 10000
    )`, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount INTEGER,
        win_amount INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`, (err) => {
        if (err) {
            console.error('Error creating bets table:', err.message);
        }
    });
});

// Add the missing updateUserBalance function
    function updateUserBalance(userId, amount) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET balance = balance + ? WHERE id = ?',
                [amount, userId],
                function(err) {
                    if (err) reject(err);
                    else {
                        db.get(
                            'SELECT balance FROM users WHERE id = ?',
                            [userId],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row.balance);
                            }
                        );
                    }
                }
            );
        });
    }

    function getUserBalance(userId) {
        return new Promise((resolve, reject) => {
            if (!userId) {
                reject(new Error('User ID is required'));
                return;
            }

            db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) {
                    console.error('Database error:', err.message);
                    reject(new Error('Database error occurred'));
                    return;
                }
                if (!row) {
                    reject(new Error('User not found'));
                    return;
                }
                resolve(row.balance);
            });
        });
    }

    function createUser(username) {
        return new Promise((resolve, reject) => {
            if (!username) {
                reject(new Error('Username is required'));
                return;
            }

            db.run('INSERT INTO users (username, balance) VALUES (?, ?)', [username, 10000], function(err) {
                if (err) {
                    console.error('Database error:', err.message);
                    reject(new Error('Failed to create user'));
                    return;
                }
                
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, row) => {
                    if (err) {
                        console.error('Database error:', err.message);
                        reject(new Error('Failed to retrieve created user'));
                        return;
                    }
                    resolve(row);
                });
            });
        });
    }

    module.exports = {
        db,
        updateUserBalance,
        getUserBalance,
        createUser
    };