import {escapeHtml,statusName} from './utils.mjs';
const intro=(content)=>`<!doctype html><html><body style="margin:0;background:#f7f6f2;font-family:Arial,sans-serif;color:#172536"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:34px 12px"><table role="presentation" width="540" style="max-width:100%;background:white;border:1px solid #e5e7e7;border-radius:14px" cellspacing="0"><tr><td style="padding:27px 30px 8px;font-weight:bold;font-size:27px;letter-spacing:-1px">TeleDelo</td></tr><tr><td style="padding:10px 30px 30px;font-size:15px;line-height:1.65">${content}</td></tr><tr><td style="padding:19px 30px;border-top:1px solid #e9ebeb;color:#6b7784;font-size:12px">Your phone, answered.<br>TeleDelo customer support</td></tr></table></td></tr></table></body></html>`;
export function buildEmail(template,payload,env){const root=(env.PUBLIC_ORIGIN||'https://teledelo.com').replace(/\/$/,'');let subject='',content='',text='';const supportStaff=(env.SUPPORT_STAFF_ORIGIN||root).replace(/\/$/,'')+'/help/admin';const reference=escapeHtml(payload.reference||''),url=escapeHtml(root+'/help/requests');switch(template){
case 'ticket_created':subject=`We received your request ${payload.reference}`;content=`<h2 style="font-size:21px">Your request is in.</h2><p>We've received support request <strong>${reference}</strong>. Our team can review it and reply here.</p><p><a href="${url}" style="color:#2f5f9c">View your requests</a></p>`;text=`Your support request ${payload.reference} was received. View it at ${root}/help/requests`;break;
case 'staff_new_ticket':subject=`New support request: ${payload.reference}`;content=`<h2 style="font-size:21px">New request received</h2><p>Ticket <strong>${reference}</strong> (${escapeHtml(payload.urgency||'normal')}) is ready for review.</p><p><a href="${escapeHtml(supportStaff)}" style="color:#2f5f9c">Open support inbox</a></p>`;text=`New ticket ${payload.reference}. Open ${supportStaff}`;break;
case 'staff_reply':subject=`A reply on request ${payload.reference}`;content=`<h2 style="font-size:21px">We replied to your request.</h2><p>There's a new message on support request <strong>${reference}</strong>.</p><p><a href="${url}" style="color:#2f5f9c">Read the reply</a></p>`;text=`New reply on ${payload.reference}: ${root}/help/requests`;break;
case 'customer_reply':subject=`Customer replied: ${payload.reference}`;content=`<h2 style="font-size:21px">A customer replied.</h2><p>Review ticket <strong>${reference}</strong> in the staff inbox.</p><p><a href="${escapeHtml(supportStaff)}" style="color:#2f5f9c">Open ticket inbox</a></p>`;text=`Customer replied on ${payload.reference}: ${supportStaff}`;break;
case 'status_updated':subject=`Update on support request ${payload.reference}`;content=`<h2 style="font-size:21px">Your request was updated.</h2><p>Ticket <strong>${reference}</strong> is now marked <strong>${escapeHtml(statusName(payload.status))}</strong>.</p><p><a href="${url}" style="color:#2f5f9c">View your request</a></p>`;text=`Ticket ${payload.reference} status: ${statusName(payload.status)}. ${root}/help/requests`;break;
case 'intake_staff_privacy-request':
case 'intake_staff_waitlist':
case 'intake_staff_demo': {
  const department = template.slice('intake_staff_'.length);
  const isPrivacy = department === 'privacy-request';
  const isWaitlist = department === 'waitlist';
  const title = isPrivacy ? 'New Privacy Request' : isWaitlist ? 'New Waitlist Registration' : 'New Demo Request';
  const host = env.INTAKE_STAFF_ORIGIN || root;
  const staffUrl = host.replace(/\/$/, '') + '/help/admin/intake/' + (isPrivacy ? 'privacy' : department);
  subject = 'TeleDelo — ' + title;
  const facts = [
    ['Reference', payload.reference],
    ...(isPrivacy ? [['Request type', payload.requestType], ['Review status', 'Received · awaiting review']] :
      [['Business', payload.business], [isWaitlist ? 'Interested plan' : 'Requested demonstration details', isWaitlist ? payload.plan : payload.topic]]),
    ['Submitted', new Date(payload.timestamp * 1000).toISOString()],
  ];
  content = `<h2 style="font-size:21px">${title}</h2><dl>${facts.map(([label, value]) =>
    `<dt style="font-weight:bold">${label}</dt><dd style="margin:0 0 12px">${escapeHtml(value)}</dd>`).join('')}</dl>
    <p><a href="${escapeHtml(staffUrl)}" style="color:#2f5f9c">Open the restricted inbox</a></p>`;
  text = facts.map(([label, value]) => label + ': ' + value).join('\n') + '\nOpen the restricted inbox: ' + staffUrl;
  break;
}
case 'intake_receipt_waitlist':
  subject = 'You’re on the TeleDelo waitlist';
  content = `<h2 style="font-size:21px">You’re on the waitlist.</h2><p>We’ll contact you about your waitlist request when we have an availability update. Your reference is <strong>${reference}</strong>.</p>`;
  text = `You’re on the TeleDelo waitlist. We’ll contact you about your waitlist request when we have an availability update. Your reference is ${payload.reference}.`;
  break;
case 'intake_receipt_demo':
  subject = 'We received your TeleDelo demo request';
  content = `<h2 style="font-size:21px">Demo request received.</h2><p>Our team will review your request and follow up. Your reference is <strong>${reference}</strong>.</p>`;
  text = `We received your TeleDelo demo request. Our team will review it and follow up. Your reference is ${payload.reference}.`;
  break;
case 'intake_receipt_privacy-request': {
  const link = root + '/privacy-request/verify#id=' + encodeURIComponent(payload.reference) + '&token=' + encodeURIComponent(payload.verificationToken);
  subject = 'Verify your TeleDelo privacy request';
  content = `<h2 style="font-size:21px">We received your privacy request.</h2><p>Reference <strong>${reference}</strong>.</p>
    <p><a href="${escapeHtml(link)}" style="color:#2f5f9c">Verify your email address</a></p>
    <p>This link expires in 48 hours. Our privacy team may contact you to verify your identity. If you didn’t submit a request, you can ignore this email.</p>`;
  text = `We received privacy request ${payload.reference}. Verify your email (48-hour link): ${link}\nOur privacy team may contact you to verify your identity. If you didn’t submit a request, you can ignore this email.`;
  break;
}
default:throw new Error('unknown email template');}
return {subject,html:intro(content),text,replyTo:template.startsWith('intake_') ?
  (template.endsWith('privacy-request') ? 'privacy@teledelo.com' : 'hello@teledelo.com') : undefined}}
export async function sendMail(env,to,subject,html,text,replyTo){if(!env.EMAIL||!env.FROM_EMAIL)throw new Error('Email service is not configured');return env.EMAIL.send({to,from:{email:env.FROM_EMAIL,name:'TeleDelo'},replyTo:replyTo||env.REPLY_TO_EMAIL||env.FROM_EMAIL,subject,html,text})}
