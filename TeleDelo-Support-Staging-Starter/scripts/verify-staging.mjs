import {readFileSync,existsSync} from 'node:fs';
import {exit} from 'node:process';
const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const issues=[];
if(c.name!=='teledelo-support-staging')issues.push('Wrangler name is not the staging Worker');
if(c.workers_dev!==true)issues.push('Staging workers.dev URL is disabled');
if(c.route||c.routes)issues.push('Staging configuration has a route for the live domain');
if(c.vars?.ENVIRONMENT!=='staging')issues.push('ENVIRONMENT is not staging');
if(c.d1_databases?.length!==1||c.d1_databases[0].database_name!=='teledelo-support-staging')issues.push('Staging D1 binding is not isolated');
if(!/^[a-f0-9-]{36}$/i.test(c.d1_databases?.[0]?.database_id||''))issues.push('Create a staging D1 database and paste its UUID');
if(!c.assets?.directory||!existsSync(c.assets.directory))issues.push('Missing Help Center frontend assets');
if(!existsSync('migrations/0001_tickets.sql'))issues.push('Missing D1 schema');
if(!c.vars?.PUBLIC_ORIGIN)issues.push('Set PUBLIC_ORIGIN to the real staging URL after first deployment');
if(!c.vars?.TURNSTILE_SITE_KEY)issues.push('Configure a Turnstile site key for staging');
if(!c.vars?.ACCESS_TEAM_DOMAIN||!c.vars?.ACCESS_AUD||!c.vars?.STAFF_EMAILS)issues.push('Configure Cloudflare Access for the staging staff inbox');
if(!c.vars?.STAFF_NOTIFY_EMAIL)issues.push('Set STAFF_NOTIFY_EMAIL to a monitored test inbox');
console.log('TeleDelo independent support staging checks');
if(issues.length){for(const s of issues)console.log('  TODO: '+s);console.log(`\n${issues.length} remaining setup tasks. No account changes were made.`);exit(1)}
console.log('Local staging configuration looks complete. Verify Cloudflare bindings and live integrations after deployment.');
