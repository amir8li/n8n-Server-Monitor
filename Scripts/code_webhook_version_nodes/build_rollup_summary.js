// code of Build Rollup Summary node
const chatIds = [
  // your group id(s)
];
let allReports = [];

let runIndex = 0;
while (true) {
  try {
    const runData = $('Code in JavaScript').all(0, runIndex);
    if (!runData || runData.length === 0) break;
    allReports.push(...runData);
    runIndex++;
  } catch (err) {
    break;
  }
}

if (allReports.length <= 1) {
  const doneItems = $input.all();
  if (doneItems.length > allReports.length) {
    allReports = doneItems;
  }
}

let serverStatusList = [];
let healthyCount = 0;
let alertCount = 0;

for (const item of allReports) {
  const text = item.json.text || '';
  const serverId = (item.json.server_id || item.json.id || 'UNKNOWN').toString().toUpperCase();

  const statusMatch = text.match(/(🟢|🟡|🔴)\s*<b>([^<]+)<\/b>/i);

  if (statusMatch) {
    const emoji = statusMatch[1];
    const statusText = statusMatch[2].trim();

    if (emoji === '🟢') healthyCount++;
    else alertCount++;

    serverStatusList.push(`${emoji} <b>${statusText}</b>`);
  } else {
    healthyCount++;
    serverStatusList.push(`🟢 <b>${serverId}: Status Operational</b>`);
  }
}

const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran', hour12: false });

const message = 
`📊 <b>Infrastructure Health Status Dashboard</b>
⏱️ Audit Time: <code>${now}</code>
━━━━━━━━━━━━━━━━━━━━

${serverStatusList.join('\n')}

━━━━━━━━━━━━━━━━━━━━
📈 <b>Total Summary:</b> <code>${serverStatusList.length}</code> servers audited.
🟢 Operational: <code>${healthyCount}</code> | 🔴 Needs Attention: <code>${alertCount}</code>`;

return chatIds.map(id => ({
  json: {
    chatId: id,
    text: message
  }
}));
