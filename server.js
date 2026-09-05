const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

app.use(express.json());

// Servir la landing y, más adelante, nuestro panel
app.use(express.static(path.join(__dirname, "public")));

// Obtener el número de WhatsApp actualmente activo
app.get("/api/whatsapp", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT whatsapp_number FROM config WHERE id = 1",
    );

    res.json({
      number: result.rows[0].whatsapp_number,
    });
  } catch (error) {
    console.error("Error obteniendo WhatsApp:", error);

    res.status(500).json({
      ok: false,
      message: "Error obteniendo el número de WhatsApp",
    });
  }
});

// Cambiar el número de WhatsApp activo
app.post("/api/whatsapp", async (req, res) => {
  try {
    let { number } = req.body;

    if (!number) {
      return res.status(400).json({
        ok: false,
        message: "Tenés que ingresar un número.",
      });
    }

    // Dejamos solamente números
    number = String(number).replace(/\D/g, "");

    if (number.length < 8 || number.length > 15) {
      return res.status(400).json({
        ok: false,
        message: "El número ingresado no parece válido.",
      });
    }

    await pool.query(
      `
      INSERT INTO config (id, whatsapp_number)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET whatsapp_number = EXCLUDED.whatsapp_number
      `,
      [number],
    );

    res.json({
      ok: true,
      number: number,
    });
  } catch (error) {
    console.error("Error actualizando WhatsApp:", error);

    res.status(500).json({
      ok: false,
      message: "Error actualizando el número.",
    });
  }
});
// Prueba para comprobar que el backend funciona
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    mensaje: "Servidor funcionando",
  });
});
async function iniciarBaseDeDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY,
        whatsapp_number VARCHAR(15) NOT NULL
      )
    `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id UUID PRIMARY KEY,
        fbp TEXT,
        fbc TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )
    `);

    await pool.query(`
      INSERT INTO config (id, whatsapp_number)
      VALUES (1, '5491125717779')
      ON CONFLICT (id) DO NOTHING
    `);

    console.log("Base de datos conectada correctamente");
  } catch (error) {
    console.error("Error iniciando base de datos:", error);
  }
}

iniciarBaseDeDatos();
const crypto = require("crypto");

// Normaliza y hashea el teléfono como requiere Meta
function hashTelefono(phone) {
  const normalizado = String(phone).replace(/\D/g, "");

  return crypto.createHash("sha256").update(normalizado).digest("hex");
}
app.post("/api/contact", async (req, res) => {
  try {
    const { fbp, fbc } = req.body;

    const contactId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO whatsapp_contacts (
        id,
        fbp,
        fbc,
        user_agent
      )
      VALUES ($1, $2, $3, $4)
      `,
      [contactId, fbp || null, fbc || null, req.get("user-agent") || null],
    );

    res.json({
      ok: true,
      contactId,
    });
  } catch (error) {
    console.error("Error registrando contacto:", error);

    res.status(500).json({
      ok: false,
      message: "No se pudo registrar el contacto.",
    });
  }
});
// Registrar una compra en Meta
app.post("/api/purchase", async (req, res) => {
  try {
    let { phone, reference, value, currency } = req.body;
    let contact = null;

    if (reference) {
      const resultado = await pool.query(
        `
    SELECT fbp, fbc, user_agent
    FROM whatsapp_contacts
    WHERE id::text LIKE $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
        [reference + "%"],
      );

      if (resultado.rows.length > 0) {
        contact = resultado.rows[0];
        console.log("Contacto encontrado para Purchase:", reference);
      } else {
        console.log("No se encontró la referencia:", reference);
      }
    }

    // Validaciones
    phone = String(phone || "").replace(/\D/g, "");
    value = Number(value);
    currency = String(currency || "")
      .toUpperCase()
      .trim();

    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({
        ok: false,
        message: "El teléfono no parece válido.",
      });
    }

    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({
        ok: false,
        message: "El importe no es válido.",
      });
    }

    if (!["ARS", "USD"].includes(currency)) {
      return res.status(400).json({
        ok: false,
        message: "La moneda debe ser ARS o USD.",
      });
    }

    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      throw new Error("Faltan las credenciales de Meta.");
    }

    const eventId = crypto.randomUUID();

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",

          event_source_url: "https://landing-meta.onrender.com/",

          user_data: {
            ph: [hashTelefono(phone)],
            ...(contact?.fbp && { fbp: contact.fbp }),
            ...(contact?.fbc && { fbc: contact.fbc }),
            ...(contact?.user_agent && {
              client_user_agent: contact.user_agent,
            }),
          },

          custom_data: {
            currency: currency,
            value: value,
          },
        },
      ],
      test_event_code: "TEST9727",
    };

    const response = await fetch(
      `https://graph.facebook.com/v24.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const metaResponse = await response.json();

    if (!response.ok) {
      console.error("Error de Meta:", metaResponse);

      return res.status(502).json({
        ok: false,
        message: "Meta rechazó el evento.",
      });
    }

    console.log("Purchase enviado a Meta:", eventId);

    res.json({
      ok: true,
      message: "Compra registrada correctamente.",
      eventId: eventId,
    });
  } catch (error) {
    console.error("Error enviando Purchase:", error);

    res.status(500).json({
      ok: false,
      message: "No se pudo registrar la compra.",
    });
  }
});
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
