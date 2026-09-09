const TG_API = "https://api.telegram.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // HOME
    // =========================
    if (url.pathname === "/") {
      return new Response("Lecture Bot API is running! 🚀");
    }

    // =========================
    // TELEGRAM WEBHOOK
    // =========================
    if (
      url.pathname === "/webhook" &&
      request.method === "POST"
    ) {
      // Verify Telegram secret
      const secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", {
          status: 401
        });
      }

      const update = await request.json();

      // Telegram message or channel post
      const message =
        update.message ||
        update.channel_post;

      if (!message) {
        return new Response("OK");
      }

      // Get video or document
      const media =
        message.video ||
        message.document;

      if (!media) {
        return new Response("OK");
      }

      // Title priority:
      // Caption → filename → fallback
      const title =
        message.caption ||
        media.file_name ||
        "Untitled Lecture";

      const caption =
        message.caption ||
        "";

      // Save in D1
      await env.DB.prepare(`
        INSERT INTO lectures (
          file_id,
          title,
          caption,
          created_at
        )
        VALUES (?, ?, ?, ?)
      `)
        .bind(
          media.file_id,
          title,
          caption,
          new Date().toISOString()
        )
        .run();

      return new Response("OK");
    }

    // =========================
    // GET ALL LECTURES
    // =========================
    if (url.pathname === "/lectures") {
      const result = await env.DB.prepare(`
        SELECT
          id,
          title,
          caption,
          created_at
        FROM lectures
        ORDER BY id DESC
      `).all();

      return new Response(
        JSON.stringify(result.results),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    // =========================
    // STREAM VIDEO
    // =========================
    if (
      url.pathname.startsWith("/stream/") &&
      request.method === "GET"
    ) {
      const id = url.pathname.split("/").pop();

      // Get lecture from database
      const lecture = await env.DB.prepare(`
        SELECT file_id, title
        FROM lectures
        WHERE id = ?
      `)
        .bind(id)
        .first();

      if (!lecture) {
        return new Response(
          "Lecture not found",
          { status: 404 }
        );
      }

      // =========================
      // TELEGRAM getFile
      // =========================
      const getFileUrl =
        `${TG_API}/bot${env.BOT_TOKEN}/getFile?file_id=` +
        encodeURIComponent(lecture.file_id);

      const fileResponse = await fetch(getFileUrl);

      const fileInfo =
        await fileResponse.json();

      // Show actual Telegram error
      if (!fileInfo.ok) {
        return new Response(
          JSON.stringify({
            error: "Telegram getFile failed",
            telegram_response: fileInfo
          }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      const filePath =
        fileInfo.result.file_path;

      // =========================
      // DOWNLOAD / STREAM FILE
      // =========================
      const telegramFileUrl =
        `${TG_API}/file/bot${env.BOT_TOKEN}/${filePath}`;

      // Forward Range header for video seeking
      const headers = new Headers();

      const range =
        request.headers.get("Range");

      if (range) {
        headers.set("Range", range);
      }

      const mediaResponse =
        await fetch(
          telegramFileUrl,
          {
            headers
          }
        );

      if (!mediaResponse.ok && mediaResponse.status !== 206) {
        return new Response(
          `Telegram media request failed: ${mediaResponse.status}`,
          {
            status: 502
          }
        );
      }

      // Copy important headers
      const responseHeaders =
        new Headers();

      const contentType =
        mediaResponse.headers.get("Content-Type");

      const contentLength =
        mediaResponse.headers.get("Content-Length");

      const contentRange =
        mediaResponse.headers.get("Content-Range");

      if (contentType) {
        responseHeaders.set(
          "Content-Type",
          contentType
        );
      }

      if (contentLength) {
        responseHeaders.set(
          "Content-Length",
          contentLength
        );
      }

      if (contentRange) {
        responseHeaders.set(
          "Content-Range",
          contentRange
        );
      }

      responseHeaders.set(
        "Accept-Ranges",
        "bytes"
      );

      responseHeaders.set(
        "Access-Control-Allow-Origin",
        "*"
      );

      return new Response(
        mediaResponse.body,
        {
          status: mediaResponse.status,
          headers: responseHeaders
        }
      );
    }

    // =========================
    // NOT FOUND
    // =========================
    return new Response(
      "Not Found",
      { status: 404 }
    );
  }
};
