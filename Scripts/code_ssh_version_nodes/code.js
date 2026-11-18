// code of Code in JavaScript node
const chatIds = [
  // your group id(s)
];

const reportText = $('Basic LLM Chain').first().json.text;

return chatIds.map(id => ({
  json: {
    chatId: id,
    text: reportText
  }
}));
