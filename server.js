const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Servir la landing y, más adelante, nuestro panel
app.use(express.static(path.join(__dirname, "public")));

// Configuración persistente
const configPath = path.join(__dirname, "data", "config.json");

function leerConfig() {
  const contenido = fs.readFileSync(configPath, "utf8");
  return JSON.parse(contenido);
}

function guardarConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

// Obtener el número de WhatsApp actualmente activo
app.get("/api/whatsapp", (req, res) => {
  const config = leerConfig();

  res.json({
    number: config.whatsappNumber,
  });
});

// Cambiar el número de WhatsApp activo
app.post("/api/whatsapp", (req, res) => {
  let { number } = req.body;

  if (!number) {
    return res.status(400).json({
      ok: false,
      message: "Tenés que ingresar un número.",
    });
  }

  // Sacamos +, espacios, guiones, paréntesis, etc.
  number = String(number).replace(/\D/g, "");

  if (number.length < 8 || number.length > 15) {
    return res.status(400).json({
      ok: false,
      message: "El número ingresado no parece válido.",
    });
  }

  const config = leerConfig();

  config.whatsappNumber = number;

  guardarConfig(config);

  res.json({
    ok: true,
    number: config.whatsappNumber,
  });
});
// Prueba para comprobar que el backend funciona
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    mensaje: "Servidor funcionando",
  });
});

app.listen(PORT, () => {
  console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
