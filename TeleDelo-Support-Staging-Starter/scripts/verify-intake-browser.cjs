const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.TD_BROWSER_ORIGIN || 'http://127.0.0.1:8790';
const screenshots = process.env.TD_SCREENSHOTS || './screenshots';
const files = new Map([['/help/','help'],['/waitlist?plan=pro','waitlist'],['/demo','demo'],['/privacy-request','privacy'],['/calculator?plan=pro','calculator']]);
async function run(){
 fs.mkdirSync(screenshots,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://challenges.cloudflare.com/**',route=>{
   route.fulfill({contentType:'application/javascript',body:`window.turnstile={ready(fn){fn()},render(el,opts){opts.callback('XXXX.DUMMY.TOKEN.XXXX');this.callback=opts.callback;return 'test'},reset(){this.callback('XXXX.DUMMY.TOKEN.XXXX')}}`});
 });
 for(const width of [320,375,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const [url,name] of files){
   const result=await page.goto(base+url);
   assert.equal(result.status(),200,url);
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);
   if(name==='waitlist') assert.equal(await page.locator('#plan').inputValue(),'pro');
   if(name==='calculator'){
    assert.ok(await page.locator('#resultCta').getAttribute('href'));
    if ([390,1440].includes(width)) {
     await page.locator('input[type=radio][value=pro]').check();
     assert.equal(await page.locator('#resultCta').getAttribute('href'),'/waitlist?plan=pro');
    }
   }
   if(name!=='help' && [390,1440].includes(width)){
    await page.evaluate(fs.readFileSync(process.env.AXE_SCRIPT || require.resolve('axe-core/axe.min.js'),'utf8'));
    const violations=await page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id+': '+v.nodes.map(n=>n.target).join(',')));
    assert.deepEqual(violations,[],name+' '+width+' WCAG checks');
   }
   if([390,1440].includes(width)) await page.screenshot({path:path.join(screenshots,name+'-'+width+'.png'),fullPage:true});
  }
 }
 await page.goto(base+'/calculator');
 for(const key of ['lite','teledelo','pro']){
  await page.locator('input[type="radio"][value="'+key+'"]').check();
  const route=await page.locator('#resultCta').getAttribute('href');
  await page.goto(base+route);
  assert.equal(await page.locator('#plan').inputValue(),key);
  await page.goto(base+'/calculator');
 }
 await page.locator('#calls').fill('10');
 await page.locator('#profit').fill('30');
 assert.equal(await page.locator('#net').innerText(),'+$61');
 await page.locator('#plan-teledelo').check();
 await page.locator('#assumptions summary').click();
 await page.locator('#extra').fill('100');
 assert.equal(await page.locator('#net').innerText(),'−$98');
 await page.locator('#conversion').selectOption('5');
 assert.equal(await page.locator('#net').innerText(),'+$32');
 await page.locator('#plan-pro').check();
 assert.equal(await page.locator('#net').innerText(),'−$239');
 await page.locator('#calls').fill('-1');
 assert.equal(await page.locator('#calls-error').isVisible(),true);
 await page.locator('#reset').click();
 assert.equal(await page.locator('#calls').inputValue(),'8');
 assert.equal(await page.locator('#plan-lite').isChecked(),true);
 await page.goto(base+'/privacy-request');
 const button=page.locator('button[type=submit]');
 await button.click();
 assert.equal(await page.locator('#name').evaluate(e=>e.validity.valueMissing),true);
 await page.locator('#name').fill('Fictional Reviewer');
 await page.locator('#email').fill('reviewer@example.test');
 await page.locator('#request_type').selectOption('other');
 await button.click();
 await page.getByText('The security check is temporarily unavailable. Please try again.').waitFor();
 assert.equal(await page.locator('#form-result').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: 30 route/viewport combinations, 8 WCAG scans, calculator math and reset, 3 calculator-to-waitlist links, form validation and API error');
 await browser.close();
}
run().catch(err=>{console.error(err);process.exit(1)});
