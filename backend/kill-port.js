// Kill whatever is on port 5001 and start fresh
const { execSync } = require('child_process');
try {
      const result = execSync('netstat -ano', { encoding: 'utf8' });
      const lines = result.split('\n').filter(l => l.includes(':5001') && l.includes('LISTENING'));
      for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid) && pid !== '0') {
                  console.log(`Killing PID ${pid} on port 5001`);
                  try { execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' }); } catch (e) { console.log('Kill result:', e.message); }
            }
      }
      console.log('Port cleanup done');
} catch (e) {
      console.log('netstat error:', e.message);
}
