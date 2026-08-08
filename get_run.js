const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://xnyntnputfqnuxwdyxsi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhueW50bnB1dGZxbnV4d2R5eHNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjEzODUxMCwiZXhwIjoyMTAxNzE0NTEwfQ.LcYU-pohVoTqvXaZdBUBeta4w_hLtCo3JmrTrswfqR8');

async function main() {
  const { data, error } = await supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(1);
  if (data && data.length > 0) {
    const runId = data[0].id;
    const { data: calls } = await supabase.from('agent_calls').select('*').eq('run_id', runId).order('created_at', { ascending: true });
    console.log('Calls:', calls);
    
    const { data: diffs } = await supabase.from('state_diffs').select('*').eq('run_id', runId).order('created_at', { ascending: true });
    console.log('Diffs:', diffs.filter(d => d.new_value === 'audit' || d.old_value === 'extract'));
  }
}
main();
