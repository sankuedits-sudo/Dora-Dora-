export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Home page
    if (url.pathname === "/") {
      return new Response("Lecture Bot API is running! 🚀");
    }

    // Telegram webhook
    if (url.pathname === "/webhook" && request.method === "POST") {

      // Verify Telegram webhook secret
      const secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const update = await request.json();

      // Get message
      const message =
        update.message ||
        update.channel_post;

      if (!message) {
        return new Response("OK");
      }

      // Check for video
      const video = message.video || message.document;

      if (video) {
        const fileId = video.file_id;
        const fileName =
          video.file_name ||
          message.caption ||
          "Lecture Video";

        const caption = message.caption || "";

        // Save lecture metadata to D1
        await env.DB.prepare(`
          INSERT INTO lectures
          (file_id, title, caption, created_at)
          VALUES (?, ?, ?, ?)
        `)
          .bind(
            fileId,
            fileName,
            caption,
            new Date().toISOString()
          )
          .run();
      }

      return new Response("OK");
    }

    // Get all lectures
    if (url.pathname === "/lectures") {
      const result = await env.DB.prepare(`
        SELECT *
        FROM lectures
        ORDER BY id DESC
      `).all();

      return Response.json(result.results);
    }

    return new Response("Not Found", { status: 404 });
  }
};
