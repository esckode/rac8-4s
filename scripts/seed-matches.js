#!/usr/bin/env node
/**
 * Seed test data: Create a tournament with players and group stage matches
 * This enables the Matches tab to display real match data
 */

import jwt from 'jsonwebtoken';

const API_BASE = 'http://localhost:3001';
const JWT_SECRET = 'dev-secret-key-change-in-production'; // Must match server.ts
const ORGANIZER_ID = 'test-organizer-1';
const TEST_PLAYERS = [
  { id: 'player-1', name: 'Alice Smith', email: 'alice@test.local' },
  { id: 'player-2', name: 'Bob Johnson', email: 'bob@test.local' },
  { id: 'player-3', name: 'Carol Williams', email: 'carol@test.local' },
  { id: 'player-4', name: 'David Brown', email: 'david@test.local' },
  { id: 'player-5', name: 'Eve Davis', email: 'eve@test.local' },
  { id: 'player-6', name: 'Frank Miller', email: 'frank@test.local' },
];

function createOrganizerToken() {
  return jwt.sign(
    {
      sub: ORGANIZER_ID,
      role: 'organizer',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function createPlayerToken(playerId) {
  return jwt.sign(
    {
      playerId,
      role: 'player',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function createTournament() {
  console.log('Creating tournament...');

  const orgToken = createOrganizerToken();

  const res = await fetch(`${API_BASE}/tournaments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orgToken}`,
    },
    body: JSON.stringify({
      name: `Test Tournament - ${new Date().toISOString().split('T')[0]} ${Date.now() % 1000}`,
      sport: 'badminton',
      matchFormat: 'singles',
      maxPlayers: 16,
      description: 'A test tournament to demonstrate the Matches page',
      registrationDeadline: new Date(Date.now() + 86400000).toISOString(),
      groupStageDeadline: new Date(Date.now() + 172800000).toISOString(),
      knockoutStageDeadline: new Date(Date.now() + 259200000).toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create tournament: ${res.status} ${await res.text()}`);
  }

  const tournament = await res.json();
  console.log(`✓ Tournament created: ${tournament.id}`);

  return { tournament, orgToken };
}

async function openRegistration(tournamentId, orgToken) {
  console.log('\nOpening registration...');

  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orgToken}`,
    },
    body: JSON.stringify({
      action: 'OPEN_REGISTRATION',
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to open registration: ${res.status} ${await res.text()}`);
  }

  console.log('✓ Registration opened');
}

async function registerPlayers(tournamentId, orgToken) {
  console.log(`\nRegistering ${TEST_PLAYERS.length} players...`);

  // Create player tokens and register them
  for (const player of TEST_PLAYERS) {
    const playerToken = createPlayerToken(player.id);

    const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${playerToken}`,
      },
      body: JSON.stringify({
        name: player.name,
        email: player.email,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to register ${player.name}: ${res.status} ${await res.text()}`);
    }

    console.log(`  ✓ ${player.name}`);
  }
}

async function closeRegistration(tournamentId, orgToken) {
  console.log('\nClosing registration...');

  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orgToken}`,
    },
    body: JSON.stringify({
      action: 'CLOSE_REGISTRATION',
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to close registration: ${res.status} ${await res.text()}`);
  }

  console.log('✓ Registration closed');
}

async function createGroups(tournamentId, orgToken) {
  console.log('\nCreating groups and generating matches...');

  const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orgToken}`,
    },
    body: JSON.stringify({
      numGroups: 2,
      advancingPerGroup: 2,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create groups: ${res.status} ${await res.text()}`);
  }

  const result = await res.json();
  console.log(`✓ Created ${result.length || 2} groups with auto-generated round-robin matches`);

  return result;
}

async function main() {
  try {
    console.log('🌱 Seeding test tournament with matches...\n');

    const { tournament, orgToken } = await createTournament();
    await openRegistration(tournament.id, orgToken);
    await registerPlayers(tournament.id, orgToken);
    await closeRegistration(tournament.id, orgToken);
    await createGroups(tournament.id, orgToken);

    console.log(`\n✅ Success! Test tournament ready: ${tournament.id}`);
    console.log('\nNext steps:');
    console.log('1. Visit http://localhost:5173');
    console.log('2. Sign in as a player (any email works for testing)');
    console.log(`3. View your tournaments at http://localhost:5173/standings`);
    console.log(`4. Click on "${tournament.name}" to see the Matches tab with test data\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
