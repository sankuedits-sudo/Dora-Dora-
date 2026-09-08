export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Home / test route
    if (url.pathname === "/") {
      return new Response("Lecture Bot API is running! 🚀");
    }

    // Telegram webhook
    if (url.pathname === "/webhook") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      // Telegram secret token verify
      const secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const update = await request.json();
      const message = update.message;

      if (!message) {
        return new Response("OK");
      }

      // Check for video or document
      const file = message.video || message.document;

      if (file) {
        console.log("New lecture received!");

        console.log({
          file_id: file.file_id,
          file_unique_id: file.file_unique_id,
          file_name: file.file_name || "video.mp4",
          caption: message.caption || "Untitled Lecture"
        });
      }

      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }
};
