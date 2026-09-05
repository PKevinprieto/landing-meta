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
app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
