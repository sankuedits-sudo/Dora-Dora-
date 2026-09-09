const TG = "https://api.telegram.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Home
    if (url.pathname === "/") {
      return new Response("Lecture Bot API is running! 🚀");
    }

    // Telegram webhook receives videos
    if (url.pathname === "/webhook" && request.method === "POST") {
      const secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const update = await request.json();
      const message = update.message || update.channel_post;

      if (!message) return new Response("OK");

      const media = message.video || message.document;

      if (media) {
        const title =
          message.caption ||
          media.file_name ||
          "Untitled Lecture";

        await env.DB.prepare(`
          INSERT INTO lectures
          (file_id, title, caption, created_at)
          VALUES (?, ?, ?, ?)
        `)
          .bind(
            media.file_id,
            title,
            message.caption || "",
            new Date().toISOString()
          )
          .run();
      }

      return new Response("OK");
    }

    // Get lecture list
    if (url.pathname === "/lectures") {
      const result = await env.DB.prepare(`
        SELECT id, title, caption, created_at
        FROM lectures
        ORDER BY id DESC
      `).all();

      return Response.json(result.results, {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Stream an authorized Telegram file
    if (url.pathname.startsWith("/stream/")) {
      const id = url.pathname.split("/").pop();

      const lecture = await env.DB.prepare(`
        SELECT file_id FROM lectures WHERE id = ?
      `).bind(id).first();

      if (!lecture) {
        return new Response("Lecture not found", { status: 404 });
      }

      // Get Telegram file path
      const fileInfo = await fetch(
        `${TG}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(lecture.file_id)}`
      );

      const info = await fileInfo.json();

      if (!info.ok) {
        return new Response("Could not access Telegram file", {
          status: 502
        });
      }

      const filePath = info.result.file_path;

      // Fetch media from Telegram and proxy it
      const telegramVideo = await fetch(
        `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`,
        {
          headers: request.headers
        }
      );

      const headers = new Headers(telegramVideo.headers);

      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Accept-Ranges", "bytes");

      return new Response(telegramVideo.body, {
        status: telegramVideo.status,
        headers
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
