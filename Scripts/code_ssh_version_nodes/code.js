// code of Code in JavaScript node

const chatIds = [
  '-1004427360464' 
];

const reportText = $('Basic LLM Chain').first().json.text;

return chatIds.map(id => ({
  json: {
    chatId: id,
    text: reportText
  }
}));