export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =====================================
    // CORS HEADERS
    // =====================================
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    // =====================================
    // OPTIONS (CORS)
    // =====================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // =====================================
    // HOME
    // =====================================
    if (url.pathname === "/") {
      return new Response(
        "Dora Dora Lecture API is running! 🚀",
        {
          headers: corsHeaders
        }
      );
    }

    // =====================================
    // TELEGRAM WEBHOOK
    // =====================================
    if (
      url.pathname === "/webhook" &&
      request.method === "POST"
    ) {
      const secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

      if (secret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders
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

      // Save Telegram lecture metadata
      await env.DB.prepare(`
        INSERT INTO lectures (
          file_id,
          title,
          caption,
          video_url,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(
          media.file_id,
          title,
          caption,
          null,
          new Date().toISOString()
        )
        .run();

      return new Response("OK");
    }

    // =====================================
    // GET ALL LECTURES
    // =====================================
    if (
      url.pathname === "/lectures" &&
      request.method === "GET"
    ) {
      const result = await env.DB.prepare(`
        SELECT
          id,
          title,
          caption,
          video_url,
          created_at
        FROM lectures
        ORDER BY id DESC
      `).all();

      return Response.json(
        result.results || [],
        {
          headers: corsHeaders
        }
      );
    }

    // =====================================
    // ADMIN ADD LECTURE
    // =====================================
    if (
      url.pathname === "/admin/add-lecture" &&
      request.method === "POST"
    ) {
      try {
        const auth =
          request.headers.get("Authorization");

        // Admin secret check
        if (
          !auth ||
          auth !== `Bearer ${env.ADMIN_SECRET}`
        ) {
          return Response.json(
            {
              error: "Unauthorized"
            },
            {
              status: 401,
              headers: corsHeaders
            }
          );
        }

        const data =
          await request.json();

        const title =
          (data.title || "").trim();

        const caption =
          (data.caption || "").trim();

        const videoUrl =
          (data.video_url || "").trim();

        // Validation
        if (!title) {
          return Response.json(
            {
              error: "Title is required"
            },
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        if (!videoUrl) {
          return Response.json(
            {
              error: "Video URL is required"
            },
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // Basic URL validation
        try {
          new URL(videoUrl);
        } catch {
          return Response.json(
            {
              error: "Invalid video URL"
            },
            {
              status: 400,
              headers: corsHeaders
            }
          );
        }

        // Save lecture
        const result =
          await env.DB.prepare(`
            INSERT INTO lectures (
              file_id,
              title,
              caption,
              video_url,
              created_at
            )
            VALUES (?, ?, ?, ?, ?)
          `)
            .bind(
              null,
              title,
              caption,
              videoUrl,
              new Date().toISOString()
            )
            .run();

        return Response.json(
          {
            success: true,
            message: "Lecture added successfully! 🎉",
            id: result.meta.last_row_id
          },
          {
            headers: corsHeaders
          }
        );

      } catch (error) {
        return Response.json(
          {
            error: "Server error",
            message: error.message
          },
          {
            status: 500,
            headers: corsHeaders
          }
        );
      }
    }

    // =====================================
    // STREAM / OPEN VIDEO
    // =====================================
    if (
      url.pathname.startsWith("/stream/") &&
      request.method === "GET"
    ) {
      const id =
        url.pathname.split("/").pop();

      const lecture =
        await env.DB.prepare(`
          SELECT
            id,
            title,
            video_url
          FROM lectures
          WHERE id = ?
        `)
          .bind(id)
          .first();

      if (!lecture) {
        return new Response(
          "Lecture not found",
          {
            status: 404,
            headers: corsHeaders
          }
        );
      }

      // If manual/external video URL exists
      if (lecture.video_url) {
        return Response.redirect(
          lecture.video_url,
          302
        );
      }

      // Telegram-only lectures don't have
      // a streamable URL yet
      return Response.json(
        {
          error: "Video source unavailable",
          message:
            "This Telegram lecture does not yet have a playable video URL."
        },
        {
          status: 404,
          headers: corsHeaders
        }
      );
    }

    // =====================================
    // NOT FOUND
    // =====================================
    return new Response(
      "Not Found",
      {
        status: 404,
        headers: corsHeaders
      }
    );
  }
};
