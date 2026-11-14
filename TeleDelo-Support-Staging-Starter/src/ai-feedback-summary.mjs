// Staff-only, aggregated AI answer feedback. No customer text or identifiers leave D1.
export async function getAIFeedbackSummary(env,at=Math.floor(Date.now()/1000)){
  const r=await env.DB.prepare(
    "SELECT COUNT(*) AS total, " +
    "COALESCE(SUM(CASE WHEN rating='helpful' THEN 1 ELSE 0 END),0) AS helpful, " +
    "COALESCE(SUM(CASE WHEN rating='unhelpful' THEN 1 ELSE 0 END),0) AS unhelpful, " +
    "COUNT(DISTINCT user_key_hash) AS unique_raters, " +
    "COUNT(DISTINCT CASE WHEN rating='helpful' THEN user_key_hash END) AS helpful_raters, " +
    "COUNT(DISTINCT CASE WHEN rating='unhelpful' THEN user_key_hash END) AS unhelpful_raters " +
    "FROM ai_answer_feedback WHERE rating IS NOT NULL AND rated_at>=?"
  ).bind(at-30*86400).first();
  const total=Number(r?.total||0),helpful=Number(r?.helpful||0),unhelpful=Number(r?.unhelpful||0);
  return {periodDays:30,total,helpful,unhelpful,
    uniqueRaters:Number(r?.unique_raters||0),
    helpfulRaters:Number(r?.helpful_raters||0),
    unhelpfulRaters:Number(r?.unhelpful_raters||0),
    helpfulPercent:total?Math.round(100*helpful/total):null};
}
