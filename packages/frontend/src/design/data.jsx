// =====================================================
// C U At Court — Sample badminton data
// =====================================================

const PLAYERS = [
  { name: 'Aanya Patel',   rank: 1820, club: 'Riverside SC' },
  { name: 'Marcus Tan',    rank: 1790, club: 'Eastside Smash' },
  { name: 'Priya Iyer',    rank: 1745, club: 'Riverside SC' },
  { name: 'Daniel Cho',    rank: 1710, club: 'Greenwood BC' },
  { name: 'Lila Okonkwo',  rank: 1690, club: 'Eastside Smash' },
  { name: 'Jonas Berg',    rank: 1675, club: 'North End' },
  { name: 'Mei Lin',       rank: 1620, club: 'Greenwood BC' },
  { name: 'Ravi Subbu',    rank: 1590, club: 'North End' },
];

const TEAMS = [
  { name: 'Aanya & Marcus',  short: 'A&M',  players: ['Aanya Patel', 'Marcus Tan'],    color: 'var(--court-300)' },
  { name: 'Priya & Daniel',  short: 'P&D',  players: ['Priya Iyer', 'Daniel Cho'],     color: 'var(--lavender-300)' },
  { name: 'Lila & Jonas',    short: 'L&J',  players: ['Lila Okonkwo', 'Jonas Berg'],   color: 'var(--peach-200)' },
  { name: 'Mei & Ravi',      short: 'M&R',  players: ['Mei Lin', 'Ravi Subbu'],        color: 'var(--mint-200)' },
];

const STANDINGS = [
  { rank: 1, team: TEAMS[0], played: 3, w: 3, l: 0, setDiff: '+5', pts: 9, form: ['W','W','W'] },
  { rank: 2, team: TEAMS[1], played: 3, w: 2, l: 1, setDiff: '+2', pts: 6, form: ['W','L','W'] },
  { rank: 3, team: TEAMS[2], played: 3, w: 1, l: 2, setDiff: '-1', pts: 3, form: ['L','W','L'] },
  { rank: 4, team: TEAMS[3], played: 3, w: 0, l: 3, setDiff: '-6', pts: 0, form: ['L','L','L'] },
];

const TOURNAMENTS = [
  {
    id: 'fns', name: 'Friday Night Smash', sport: 'Badminton · Doubles',
    venue: 'Riverside Sports Centre', date: 'Fri 16 May · 7:00 PM',
    phase: 'group', players: 16, capacity: 16, host: 'Riverside SC',
    cover: 'court', tagline: 'Casual doubles · 16 teams · prizes',
  },
  {
    id: 'mc',  name: 'Spring Singles Cup', sport: 'Badminton · Singles',
    venue: 'Eastside Smash Hall', date: 'Sat 24 May · 10:00 AM',
    phase: 'reg-open', players: 22, capacity: 32, host: 'Eastside Smash',
    cover: 'lavender', tagline: 'Open singles · all levels welcome',
  },
  {
    id: 'gw',  name: 'Greenwood Mixed Open', sport: 'Badminton · Mixed Doubles',
    venue: 'Greenwood BC', date: 'Sat 7 June · 9:00 AM',
    phase: 'reg-open', players: 9, capacity: 24, host: 'Greenwood BC',
    cover: 'mint', tagline: 'Mixed doubles · social format',
  },
  {
    id: 'kn',  name: 'Knockout Friday', sport: 'Badminton · Doubles',
    venue: 'North End Club', date: 'Fri 9 May · 7:00 PM',
    phase: 'knockout', players: 8, capacity: 8, host: 'North End',
    cover: 'peach', tagline: 'Single-elim · 8 teams · final tonight',
  },
  {
    id: 'cc',  name: 'Coastal Classic', sport: 'Badminton · Singles',
    venue: 'Riverside Sports Centre', date: 'Sun 27 Apr',
    phase: 'complete', players: 24, capacity: 24, host: 'Riverside SC',
    cover: 'gold', tagline: 'Winner: Marcus Tan',
  },
];

const MATCHES = [
  {
    id: 'm1', round: 'Group A · R1', when: 'Today 7:00 PM', court: 'Court 3',
    a: TEAMS[0], b: TEAMS[3], status: 'live',
    sets: [{a:21,b:18},{a:19,b:21},{a:14,b:9}],
  },
  {
    id: 'm2', round: 'Group A · R1', when: 'Today 7:00 PM', court: 'Court 5',
    a: TEAMS[1], b: TEAMS[2], status: 'completed',
    sets: [{a:21,b:14},{a:21,b:17}],
  },
  {
    id: 'm3', round: 'Group A · R2', when: 'Today 7:45 PM', court: 'Court 3',
    a: TEAMS[0], b: TEAMS[2], status: 'upcoming',
    sets: [],
  },
  {
    id: 'm4', round: 'Group A · R2', when: 'Today 7:45 PM', court: 'Court 5',
    a: TEAMS[1], b: TEAMS[3], status: 'upcoming',
    sets: [],
  },
];

const BRACKET_QF = [
  { id: 'qf1', a: TEAMS[0], b: TEAMS[2], score: '2-0' },
  { id: 'qf2', a: TEAMS[1], b: TEAMS[3], score: '2-1' },
  { id: 'qf3', a: { name: 'Wong & Park',   short: 'W&P', color: 'var(--pink-300)' }, b: { name: 'Hassan & Cole', short: 'H&C', color: 'var(--court-200)' }, score: '2-0' },
  { id: 'qf4', a: { name: 'Romero & Suzuki', short: 'R&S', color: 'var(--gold-200)' }, b: { name: 'Ali & Brooks',  short: 'A&B', color: 'var(--mint-200)' }, score: '0-2' },
];

Object.assign(window, { PLAYERS, TEAMS, STANDINGS, TOURNAMENTS, MATCHES, BRACKET_QF });
