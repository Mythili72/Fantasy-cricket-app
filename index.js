const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path')
const app = express();


app.use(bodyParser.json());

const port = 3000;

const { DB_USER, DB_PWD, DB_URL } = require('./models/db').database

// Database Details
// const DB_USER = DB_USER;
// const DB_PWD = DB_PWD;
// const DB_URL = DB_URL;
const DB_NAME = "task-jeff";
const DB_COLLECTION_NAME = "players";

const { addData, getAllDatabyCond, updateByCond } = require('./models/dao/commonDao');
const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');

const uri = "mongodb+srv://" + DB_USER + ":" + DB_PWD + "@" + DB_URL + "/" + DB_NAME + "?retryWrites=true&w=majority";
console.log(uri)
async function client() {
  try {
    await mongoose.connect(uri, {});
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

let db;

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    db = client.db(DB_NAME);
    console.log("You successfully connected to MongoDB!");

    // Do something with the connected database (db) here...

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  } finally {
    // Ensure to close the connection when done
    await client.close();
  }
}
client();
// run();

// Sample create document
async function sampleCreate() {
  const demo_doc = {
    "demo": "doc demo",
    "hello": "world"
  };
  const demo_create = await db.collection(DB_COLLECTION_NAME).insertOne(demo_doc);

  console.log("Added!")
  console.log(demo_create.insertedId);
}


// Endpoints

app.get('/', async (req, res) => {
  res.send('Hello World!');
});

app.get('/demo', async (req, res) => {
  await sampleCreate();
  res.send({ status: 1, message: "demo" });
});

//Load player and match data
let playersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'players.json')));
let matchData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'match.json')));

// Validate player selection rules
let validatePlayerSelection = (players) => {
  let playerLength = {
    WICKETKEEPER: 0,
    BATTER: 0,
    'ALL-ROUNDER': 0,
    BOWLER: 0
  };

  let teamLength = {
    RR: 0,
    CSK: 0
  };

  for (let player of players) {
    // Check if player exists in the players data
    let playerDetails = playersData.find(p => p.Player === player);
    if (!playerDetails) {
      throw new Error(`Player ${player} is not valid`);
    }

    // Increment player count for the player's role
    playerLength[playerDetails.Role]++;

    // Increment team count for the player's team
    if (playerDetails.Team === 'Rajasthan Royals') {
      teamLength.RR++;
    } else if (playerDetails.Team === 'Chennai Super Kings') {
      teamLength.CSK++;
    }
  }

  // Validate player counts for each role
  let roles = ['WK', 'BAT', 'AR', 'BWL'];
  for (let role of roles) {
    if (playerLength[role] < 1) {
      throw new Error(`At least one player of role ${role} must be selected`);
    }
    if (teamLength[role] > 8) {
      throw new Error(`No more than 8 players of role ${role} can be selected`);
    }
  }

  // Validate team counts
  if (teamLength.RR > 10 || teamLength.CSK > 10) {
    throw new Error('No more than 10 players can be selected from any one team');
  }
};

// Add Team Entry endpoint
app.post('/add-team', async (req, res) => {
  try {
    const { teamName, players, captain, viceCaptain } = req.body;

    // Validate number of players
    if (players.length !== 11) {
      return res.status(400).json({ error: 'A team must have 11 players' });
    }

    // Validate player selection rules
    validatePlayerSelection(players);
    let addTeam = {
      teamName: teamName,
      players: players,
      captain: captain,
      viceCaptain: viceCaptain
    }
    // Save team entry
    await addData(addTeam, "teamEntry")
    res.status(201).json({ message: 'Team entry saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process Match Result endpoint
app.post('/process-result', async (req, res) => {
  try {
    // Iterate through each ball in the match data
    for (const ball of matchData) {
      const { batter, bowler, fielders_involved, isWicketDelivery, batsman_run, extras_run } = ball;
      // Calculate points for batter
      let batterPoints = 0;
      if (isWicketDelivery === 1 && batsman_run === 0) {
        // Dismissal for a duck
        const batterRole = playersData.find(p => p.Player === batter).Role;
        if (['BATTER', 'WICKETKEEPER', 'ALL-ROUNDER'].includes(batterRole)) {
          batterPoints -= 2;
        }
      } else {
        batterPoints += batsman_run; // Run
        if (batsman_run > 3) {
          // Boundary Bonus
          batterPoints += 1;
          if (batsman_run === 4) {
            // Four Bonus
            batterPoints += 1;
          } else if (batsman_run === 6) {
            // Six Bonus
            batterPoints += 2;
          }
        }
      }

      // Calculate points for bowler
      let bowlerPoints = 0;
      if (isWicketDelivery === 1) {
        // Wicket
        bowlerPoints += 25;
        const batKind = ball.kind;
        if (['LBW', 'BOWLED'].includes(batKind)) {
          // Bonus (LBW / Bowled)
          bowlerPoints += 8;
        }
      }

      // Calculate points for fielders
      let fielderPoints = 0;

      // Check if fielders_involved is not 'NA' (indicating no fielder involvement)
      if (fielders_involved !== 'NA') {
        const fielderData = playersData.find(p => p.Player === fielders_involved);
        if (fielderData) {
          const fielderRole = fielderData.Role;
          if (fielderRole === 'WICKETKEEPER') {
            // Stumping
            fielderPoints += 12;
          } else {
            // Catch
            fielderPoints += 8;
          }
        } else {
          console.log(`Player details not found for ${fielders_involved}`);
          // Handle the case where player details are not found
        }
      }


      // Update team entries with calculated points for players
      let search = {
        query: {},
        fields: {},
        options: {}
      }
      search = {
        query: {
          players: { $in: [batter, bowler, ...fielders_involved] }
        },
        fields: {},
        options: {}
      }
      const teams = await getAllDatabyCond(search, 'teamEntry');
      for (const team of teams) {
        // Update points for batter
        if (team.players.includes(batter)) {
          team.totalPoints += batterPoints;
        }
        // Update points for bowler
        if (team.players.includes(bowler)) {
          team.totalPoints += bowlerPoints;
        }
        // Update points for fielder (if applicable)
        if (fielders_involved !== "NA" && team.players.includes(fielders_involved)) {
          team.totalPoints += fielderPoints;
        }
        await updateByCond(team._id, { totalPoints: team.totalPoints }, "teamEntry");
      }
    }

    res.json({ message: 'Match results processed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View Teams Results endpoint
app.get('/team-result', async (req, res) => {
  try {
    // Fetch team entries with their scored points
    const teams = await getAllDatabyCond({query:{},fields:'-_id,-__v',options:{}},'teamEntry');

    // Sort teams by total points in descending order
    teams.sort((a, b) => b.totalPoints - a.totalPoints);

    // Determine the winner(s)
    const highestPoints = teams.length > 0 ? teams[0].totalPoints : 0;
    const winners = teams.filter(team => team.totalPoints === highestPoints);

    res.json({
      winner: winners.length === 1 ? winners[0].teamName : null,
      winningTeams: winners.map(winner => winner.teamName),
      teams: teams
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
