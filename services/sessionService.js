/**
 * Session Service
 * Tracks conversation state per user for multi-step flows
 */

const sessions = {};

const STATES = {
  IDLE: 'idle',
  FAKE_REPORT_DRUG: 'fake_report_drug',
  FAKE_REPORT_PHARMACY: 'fake_report_pharmacy',
  FAKE_REPORT_LOCATION: 'fake_report_location',
};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { state: STATES.IDLE, data: {} };
  }
  return sessions[userId];
}

function setState(userId, state, data = {}) {
  sessions[userId] = { state, data };
}

function clearSession(userId) {
  sessions[userId] = { state: STATES.IDLE, data: {} };
}

module.exports = { getSession, setState, clearSession, STATES };
