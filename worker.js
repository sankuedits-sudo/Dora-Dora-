export default {
async fetch(request, env) {
const url = new URL(request.url);

// Test route
if (url.pathname === "/") {
  return new Response("Lecture Bot API is running!");
}

// Telegram webhook route
if (url.pathname === "/webhook" && request.method === "POST") {
  const update = await request.json();

  const message = update.message;

  if (message) {
    const file = message.video || message.document;

    if (file) {
      console.log({
        file_id: file.file_id,
        file_name: file.file_name || "video",
        caption: message.caption || "No title"
      });
    }
  }

  return new Response("OK");
}

return new Response("Not Found", {
  status: 404
});

}
};
