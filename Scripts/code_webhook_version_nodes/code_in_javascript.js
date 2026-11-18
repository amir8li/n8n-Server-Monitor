// code of Code in JavaScript node
const chatIds = [
  '-1004427360464'
  // '1991057133'
];
function sanitizeTelegramHtml(rawText) {
  if (!rawText) return '';

  let text = rawText;

  text = text.replace(/<blockquote\s+expandable\s*>/gi, '<blockquote expandable>');

  const allowedTagRegex = /^<\/?(b|i|code|blockquote(\s+expandable)?)\b[^>]*>$/i;

  const tokens = text.split(/(<\/?[a-zA-Z0-9_-]+(?:\s+[^>]*)?>)/g);
  
  const stack = [];
  let sanitized = '';

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith('<') && token.endsWith('>')) {
      if (!allowedTagRegex.test(token)) {
        sanitized += token.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        continue;
      }

      const isClosing = token.startsWith('</');
      const tagName = token.replace(/<\/?([a-zA-Z0-9]+).*/, '$1').toLowerCase();

      if (!isClosing) {
        stack.push(tagName);
        sanitized += (tagName === 'blockquote') ? '<blockquote expandable>' : `<${tagName}>`;
      } else {
        const index = stack.lastIndexOf(tagName);
        if (index === -1) {
          continue;
        }

        while (stack.length > index + 1) {
          const innerTag = stack.pop();
          sanitized += `</${innerTag}>`;
        }

        stack.pop();
        sanitized += `</${tagName}>`;
      }
    } else {
      sanitized += token.replace(/<(?!(b|\/b|i|\/i|code|\/code|blockquote expandable|\/blockquote)>)/gi, '&lt;');
    }
  }

  while (stack.length > 0) {
    const remainingTag = stack.pop();
    sanitized += `</${remainingTag}>`;
  }

  return sanitized;
}

const results = [];

for (const item of $input.all()) {
  const rawContent = item.json.text || item.json.output || '';
  const cleanContent = sanitizeTelegramHtml(rawContent);

  for (const chatId of chatIds) {
    results.push({
      json: {
        chatId: chatId,
        text: cleanContent,
        server_id: item.json.server_id || 'UNKNOWN'
      }
    });
  }
}

return results;