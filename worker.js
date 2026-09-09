const TG_API = "https://api.telegram.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {

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

        const secret = request.headers.get(
          "X-Telegram-Bot-Api-Secret-Token"
        );

        if (secret !== env.WEBHOOK_SECRET) {
          return new Response("Unauthorized", {
            status: 401
          });
        }

        const update = await request.json();

        const message =
          update.message ||
          update.channel_post;

        if (!message) {
          return new Response("OK");
        }

        const media =
          message.video ||
          message.document;

        if (!media) {
          return new Response("OK");
        }

        const title =
          message.caption ||
          media.file_name ||
          "Untitled Lecture";

        const caption =
          message.caption ||
          "";

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
      if (
        url.pathname === "/lectures" &&
        request.method === "GET"
      ) {

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
          JSON.stringify(result.results || []),
          {
            headers: {
              "Content-Type":
                "application/json; charset=utf-8",

              "Access-Control-Allow-Origin": "*",

              "Cache-Control":
                "no-store"
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

        if (!id || !/^\d+$/.test(id)) {
          return new Response(
            JSON.stringify({
              error: "Invalid lecture ID"
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }


        // =========================
        // GET LECTURE FROM DATABASE
        // =========================
        const lecture = await env.DB.prepare(`
          SELECT
            id,
            file_id,
            title
          FROM lectures
          WHERE id = ?
        `)
          .bind(Number(id))
          .first();


        if (!lecture) {
          return new Response(
            JSON.stringify({
              error: "Lecture not found",
              id: id
            }),
            {
              status: 404,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }


        // =========================
        // CHECK BOT TOKEN
        // =========================
        if (!env.BOT_TOKEN) {
          return new Response(
            JSON.stringify({
              error: "BOT_TOKEN secret is missing"
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }


        // =========================
        // TELEGRAM getFile
        // =========================
        const getFileUrl =
          `${TG_API}/bot${env.BOT_TOKEN}/getFile?file_id=` +
          encodeURIComponent(lecture.file_id);


        const fileResponse = await fetch(
          getFileUrl,
          {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
          }
        );


        const fileText =
          await fileResponse.text();


        let fileInfo;

        try {
          fileInfo = JSON.parse(fileText);
        } catch (error) {

          return new Response(
            JSON.stringify({
              error:
                "Telegram returned invalid response during getFile",

              telegram_status:
                fileResponse.status,

              response_preview:
                fileText.substring(0, 500)
            }),
            {
              status: 502,
              headers: {
                "Content-Type":
                  "application/json; charset=utf-8"
              }
            }
          );
        }


        // =========================
        // TELEGRAM ERROR
        // =========================
        if (
          !fileResponse.ok ||
          !fileInfo.ok ||
          !fileInfo.result ||
          !fileInfo.result.file_path
        ) {

          return new Response(
            JSON.stringify({
              error: "Telegram getFile failed",

              telegram_http_status:
                fileResponse.status,

              telegram_response:
                fileInfo
            }),
            {
              status: 502,
              headers: {
                "Content-Type":
                  "application/json; charset=utf-8"
              }
            }
          );
        }


        const filePath =
          fileInfo.result.file_path;


        // =========================
        // TELEGRAM FILE URL
        // =========================
        const telegramFileUrl =
          `${TG_API}/file/bot${env.BOT_TOKEN}/${filePath}`;


        // =========================
        // FORWARD RANGE HEADER
        // =========================
        const telegramHeaders = new Headers();

        const range =
          request.headers.get("Range");

        if (range) {
          telegramHeaders.set(
            "Range",
            range
          );
        }


        // =========================
        // FETCH VIDEO FROM TELEGRAM
        // =========================
        const mediaResponse =
          await fetch(
            telegramFileUrl,
            {
              method: "GET",
              headers: telegramHeaders
            }
          );


        // =========================
        // TELEGRAM MEDIA ERROR
        // =========================
        if (
          !mediaResponse.ok &&
          mediaResponse.status !== 206
        ) {

          const errorText =
            await mediaResponse.text();

          return new Response(
            JSON.stringify({
              error:
                "Telegram media download failed",

              telegram_status:
                mediaResponse.status,

              response_preview:
                errorText.substring(0, 500),

              lecture_id:
                lecture.id,

              title:
                lecture.title
            }),
            {
              status: 502,
              headers: {
                "Content-Type":
                  "application/json; charset=utf-8"
              }
            }
          );
        }


        // =========================
        // RESPONSE HEADERS
        // =========================
        const responseHeaders =
          new Headers();


        const headersToCopy = [
          "Content-Type",
          "Content-Length",
          "Content-Range",
          "Accept-Ranges",
          "Last-Modified",
          "ETag"
        ];


        for (const headerName of headersToCopy) {

          const value =
            mediaResponse.headers.get(headerName);

          if (value) {
            responseHeaders.set(
              headerName,
              value
            );
          }
        }


        responseHeaders.set(
          "Accept-Ranges",
          "bytes"
        );


        responseHeaders.set(
          "Access-Control-Allow-Origin",
          "*"
        );


        responseHeaders.set(
          "Access-Control-Expose-Headers",
          "Content-Length, Content-Range, Accept-Ranges"
        );


        responseHeaders.set(
          "Cache-Control",
          "public, max-age=3600"
        );


        // =========================
        // RETURN VIDEO STREAM
        // =========================
        return new Response(
          mediaResponse.body,
          {
            status: mediaResponse.status,

            statusText:
              mediaResponse.statusText,

            headers:
              responseHeaders
          }
        );
      }


      // =========================
      // NOT FOUND
      // =========================
      return new Response(
        "Not Found",
        {
          status: 404
        }
      );

    } catch (error) {

      // =========================
      // SHOW REAL ERROR
      // =========================
      return new Response(
        JSON.stringify({
          error:
            "Worker error",

          message:
            error.message,

          stack:
            error.stack
        }),
        {
          status: 500,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        }
      );
    }
  }
};
