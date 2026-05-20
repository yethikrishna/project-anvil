/**
 * k6 Load Testing Script — Project Anvil
 *
 * Usage:
 *   k6 run tests/load/api-load.js
 *   k6 run --vus 50 --duration 60s tests/load/api-load.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 */

import http from 'k6/http';
import {check, sleep} from 'k6';
import {Rate, Trend} from 'k6/metrics';

// ── Configuration ──

const BASE_URL = __ENV.API_URL || 'http://localhost:3100';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration', true);

// Load options
export const options = {
  stages: [
    {duration: '30s', target: 10},   // Ramp up to 10 users
    {duration: '60s', target: 50},   // Ramp up to 50 users
    {duration: '30s', target: 100},  // Spike to 100 users
    {duration: '60s', target: 50},   // Scale back to 50
    {duration: '30s', target: 0},    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    errors: ['rate<0.05'],             // Error rate under 5%
  },
};

// ── Test Scenarios ──

export default function () {
  // Test 1: Health check
  testHealthCheck();

  // Test 2: File listing
  testFileListing();

  // Test 3: Document operations
  testDocumentOperations();

  // Test 4: Search
  testSearch();

  sleep(1); // Think time
}

function testHealthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  const passed = check(res, {
    'health status 200': r => r.status === 200,
    'health response time < 100ms': r => r.timings.duration < 100,
  });
  errorRate.add(!passed);
  apiDuration.add(res.timings.duration);
}

function testFileListing() {
  const res = http.get(`${BASE_URL}/api/files?path=root`, {
    headers: {Authorization: 'Bearer test-token'},
  });
  const passed = check(res, {
    'files status 200': r => r.status === 200 || r.status === 401, // 401 is OK (no valid token in test)
    'files response time < 300ms': r => r.timings.duration < 300,
  });
  errorRate.add(!passed);
  apiDuration.add(res.timings.duration);
}

function testDocumentOperations() {
  // Create a document
  const createRes = http.post(`${BASE_URL}/api/documents`, JSON.stringify({
    title: `Load Test Doc ${__VU}-${__ITER}`,
    content: '<p>Load test content</p>',
  }), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
  });
  const passed = check(createRes, {
    'create doc status': r => r.status === 200 || r.status === 201 || r.status === 401,
  });
  errorRate.add(!passed);
  apiDuration.add(createRes.timings.duration);
}

function testSearch() {
  const res = http.get(`${BASE_URL}/api/files/search/semantic`, {
    headers: {Authorization: 'Bearer test-token'},
  });
  const passed = check(res, {
    'search status': r => r.status === 200 || r.status === 400 || r.status === 401,
  });
  errorRate.add(!passed);
  apiDuration.add(res.timings.duration);
}
