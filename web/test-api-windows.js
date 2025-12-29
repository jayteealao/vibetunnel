/**
 * Test VibeTunnel API on Windows
 * Run with: node test-api-windows.js
 *
 * Make sure the server is running first: pnpm run dev
 */

const BASE_URL = 'http://localhost:4020';

async function testAPI() {
  console.log('=== VibeTunnel API Test ===\n');

  // Test 1: Health/basic connectivity
  console.log('Test 1: Basic connectivity...');
  try {
    const resp = await fetch(`${BASE_URL}/`);
    console.log(`  Status: ${resp.status}`);
    console.log('  ✅ Server is responding');
  } catch (err) {
    console.log('  ❌ Server not responding:', err.message);
    console.log('  Make sure to run: pnpm run dev');
    process.exit(1);
  }

  // Test 2: List sessions
  console.log('\nTest 2: GET /api/sessions...');
  try {
    const resp = await fetch(`${BASE_URL}/api/sessions`);
    console.log(`  Status: ${resp.status}`);
    if (resp.ok) {
      const sessions = await resp.json();
      console.log(`  ✅ Got ${sessions.length} sessions`);
      if (sessions.length > 0) {
        console.log('  First session:', JSON.stringify(sessions[0], null, 2).substring(0, 200));
      }
    } else {
      const text = await resp.text();
      console.log('  ❌ Error response:', text);
    }
  } catch (err) {
    console.log('  ❌ Request failed:', err.message);
  }

  // Test 3: Create a session
  console.log('\nTest 3: POST /api/sessions (create session)...');
  let sessionId;
  try {
    const resp = await fetch(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: ['cmd.exe'],
        name: 'Windows Test Session',
      }),
    });
    console.log(`  Status: ${resp.status}`);
    if (resp.ok) {
      const session = await resp.json();
      sessionId = session.id;
      console.log('  ✅ Session created');
      console.log('  Session ID:', sessionId);
      console.log('  Session:', JSON.stringify(session, null, 2));
    } else {
      const text = await resp.text();
      console.log('  ❌ Error response:', text);
    }
  } catch (err) {
    console.log('  ❌ Request failed:', err.message);
    console.log('  Stack:', err.stack);
  }

  // Test 4: Get session details
  if (sessionId) {
    console.log('\nTest 4: GET /api/sessions/:id...');
    try {
      const resp = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
      console.log(`  Status: ${resp.status}`);
      if (resp.ok) {
        const session = await resp.json();
        console.log('  ✅ Got session details');
        console.log('  Status:', session.status);
        console.log('  PID:', session.pid);
      } else {
        const text = await resp.text();
        console.log('  ❌ Error:', text);
      }
    } catch (err) {
      console.log('  ❌ Request failed:', err.message);
    }

    // Test 5: Kill the session
    console.log('\nTest 5: DELETE /api/sessions/:id (cleanup)...');
    try {
      const resp = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      console.log(`  Status: ${resp.status}`);
      if (resp.ok) {
        console.log('  ✅ Session deleted');
      } else {
        const text = await resp.text();
        console.log('  ❌ Error:', text);
      }
    } catch (err) {
      console.log('  ❌ Request failed:', err.message);
    }
  }

  console.log('\n=== Test Complete ===');
}

testAPI().catch(console.error);
